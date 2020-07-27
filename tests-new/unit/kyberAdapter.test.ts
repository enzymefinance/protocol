import { BuidlerProvider } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { Hub } from '../contracts/Hub';
import { KyberAdapter } from '../contracts/KyberAdapter';
import { IKyberNetworkProxy } from '../contracts/IKyberNetworkProxy';
import { Registry } from '../contracts/Registry';
import { Vault } from '../contracts/Vault';
import { randomAddress } from '../utils';
import { assetTransferArgs, kyberTakeOrder } from '../utils/fund/integrations';

async function deploy(provider: BuidlerProvider) {
  const [deployer] = await provider.listAccounts();
  const signer = provider.getSigner(deployer);
  const mockHub = await Hub.mock(signer);
  const mockKyberNetworkProxy = await IKyberNetworkProxy.mock(signer);
  const mockRegistry = await Registry.mock(signer);
  const mockVault = await Vault.mock(signer);
  const kyberAdapter = await KyberAdapter.deploy(
    signer,
    mockRegistry,
    mockKyberNetworkProxy,
  );

  // Set mockVault config
  await mockVault.HUB.returns(mockHub);
  await mockRegistry.fundIsRegistered.given(mockHub).returns(true);
  await mockHub.vault.returns(mockVault);

  // Default config
  const defaultTakeOrderParams = {
    incomingAsset: randomAddress(),
    expectedIncomingAssetAmount: ethers.utils.parseEther('1'),
    outgoingAsset: randomAddress(),
    outgoingAssetAmount: ethers.utils.parseEther('2'),
  };

  const takeOrderSelector = kyberAdapter.abi.getSighash(
    kyberAdapter.takeOrder.fragment,
  );

  return {
    defaultTakeOrderParams,
    deployer,
    kyberAdapter,
    mockHub,
    mockKyberNetworkProxy,
    mockRegistry,
    mockVault,
    takeOrderSelector,
  };
}

let tx;

describe('KyberAdapter', () => {
  describe('constructor', () => {
    it('sets exchange', async () => {
      const { kyberAdapter, mockKyberNetworkProxy } = await provider.snapshot(
        deploy,
      );

      tx = kyberAdapter.EXCHANGE();
      await expect(tx).resolves.toBe(mockKyberNetworkProxy.address);
    });

    it('sets registry', async () => {
      const { kyberAdapter, mockRegistry } = await provider.snapshot(deploy);

      tx = kyberAdapter.REGISTRY();
      await expect(tx).resolves.toBe(mockRegistry.address);
    });
  });

  describe('parseAssetsForMethod', () => {
    // it('does not allow a bad selector', async () => {

    // });

    it('generates expected output', async () => {
      const {
        defaultTakeOrderParams,
        kyberAdapter,
        takeOrderSelector,
      } = await provider.snapshot(deploy);
      const {
        incomingAsset,
        expectedIncomingAssetAmount,
        outgoingAsset,
        outgoingAssetAmount,
      } = defaultTakeOrderParams;

      const encodedCallArgs = kyberTakeOrder(
        incomingAsset,
        expectedIncomingAssetAmount,
        outgoingAsset,
        outgoingAssetAmount,
      );

      const result = await kyberAdapter.parseAssetsForMethod(
        takeOrderSelector,
        encodedCallArgs,
      );

      expect(result.incomingAssets_[0]).toBe(incomingAsset);
      expect(result.spendAssets_[0]).toBe(outgoingAsset);
      expect((result.spendAssetAmounts_ as any)[0]).toEqBigNumber(
        outgoingAssetAmount,
      );
      expect((result.minIncomingAssetAmounts_ as any)[0]).toEqBigNumber(
        expectedIncomingAssetAmount,
      );
    });
  });

  // describe('takeOrder', () => {
  //   it('can only be called by a valid fund vault', async () => {
  //     const {
  //       defaultTakeOrderParams,
  //       kyberAdapter,
  //       mockVault,
  //       takeOrderSelector,
  //     } = await provider.snapshot(deploy);
  //     const {
  //       incomingAsset,
  //       expectedIncomingAssetAmount,
  //       outgoingAsset,
  //       outgoingAssetAmount,
  //     } = defaultTakeOrderParams;

  //     const encodedCallArgs = kyberTakeOrder(
  //       incomingAsset,
  //       expectedIncomingAssetAmount,
  //       outgoingAsset,
  //       outgoingAssetAmount,
  //     );
  //     const encodedTransferArgs = await assetTransferArgs(
  //       kyberAdapter,
  //       takeOrderSelector,
  //       encodedCallArgs,
  //     );

  //     // Reverts without a message because __isVault() asks the sender for HUB(), which an EOA doesn't have
  //     tx = kyberAdapter.takeOrder(encodedCallArgs, encodedTransferArgs);
  //     await expect(tx).rejects.toBeRevertedWith('');

  //     // TODO: there will still be several problems that cause this to revert
  //     tx = mockVault.forward(
  //       kyberAdapter.takeOrder,
  //       encodedCallArgs,
  //       encodedTransferArgs,
  //     );
  //     await expect(tx).resolves.toBeReceipt();
  //   });
  // });
});
