import { BuidlerProvider } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { Hub } from '../contracts/Hub';
import { KyberAdapter } from '../contracts/KyberAdapter';
import { IKyberNetworkProxy } from '../contracts/IKyberNetworkProxy';
import { Registry } from '../contracts/Registry';
import { Vault } from '../contracts/Vault';
import { randomAddress } from '../utils';
import { kyberTakeOrder } from '../utils/fund/integrations';

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

  return {
    deployer,
    kyberAdapter,
    mockHub,
    mockKyberNetworkProxy,
    mockRegistry,
    mockVault,
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
      const { kyberAdapter } = await provider.snapshot(deploy);

      const incomingAsset = randomAddress();
      const expectedIncomingAssetAmount = ethers.utils.parseEther('1');
      const outgoingAsset = randomAddress();
      const outgoingAssetAmount = ethers.utils.parseEther('2');
      const encodedCallArgs = kyberTakeOrder(
        incomingAsset,
        expectedIncomingAssetAmount,
        outgoingAsset,
        outgoingAssetAmount,
      );

      const selector = kyberAdapter.abi.getSighash(
        kyberAdapter.takeOrder.fragment,
      );

      const result = await kyberAdapter.parseAssetsForMethod(
        selector,
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

  describe('takeOrder', () => {
    // it('can only be called by a valid fund vault', async () => {
    //   const {
    //     kyberAdapter,
    //     mockHub,
    //     mockRegistry,
    //     mockVault,
    //   } = await provider.snapshot(deploy);
    //   const incomingAsset = randomAddress();
    //   const expectedIncomingAssetAmount = ethers.utils.parseEther('1');
    //   const outgoingAsset = randomAddress();
    //   const outgoingAssetAmount = ethers.utils.parseEther('2');
    //   const encodedCallArgs = kyberTakeOrder(
    //     incomingAsset,
    //     expectedIncomingAssetAmount,
    //     outgoingAsset,
    //     outgoingAssetAmount,
    //   );
    //   const selector = kyberAdapter.abi.getSighash(
    //     kyberAdapter.takeOrder.fragment,
    //   );
    //   const {
    //     spendAssets_: spendAssets,
    //     spendAssetAmounts_: spendAssetAmounts,
    //     incomingAssets_: incomingAssets,
    //   } = await kyberAdapter.parseAssetsForMethod(selector, encodedCallArgs);
    //   tx = await kyberAdapter.takeOrder(
    //     encodedCallArgs,
    //     encodeArgs(
    //       ['address[]', 'uint[]', 'address[]'],
    //       [spendAssets, spendAssetAmounts, incomingAssets],
    //     ),
    //   );
    // });
  });
});
