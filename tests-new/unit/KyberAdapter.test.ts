import { ethers } from 'ethers';
import { BuidlerProvider } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';
import { setupFundWithParams } from '../utils/fund';
import { kyberTakeOrder } from '../utils/fund/integrations';

let tx;

describe('KyberAdapter', () => {
  const snapshot = async (provider: BuidlerProvider) => {
    const deployment = await provider.snapshot(configureTestDeployment());
    const denominationAsset = deployment.config.tokens.weth.address;
    const hub = await setupFundWithParams({
      factory: deployment.system.fundFactory,
      denominator: denominationAsset,
      manager: deployment.config.deployer,
    });

    // Default takeOrder config
    const takeOrderSelector = deployment.system.kyberAdapter.abi.getSighash(
      deployment.system.kyberAdapter.takeOrder.fragment,
    );
    const defaultTakeOrderParams = {
      incomingAsset: deployment.config.tokens.mln.address,
      expectedIncomingAssetAmount: ethers.utils.parseEther('1'),
      outgoingAsset: denominationAsset,
      outgoingAssetAmount: ethers.utils.parseEther('2'),
    };

    return { ...deployment, defaultTakeOrderParams, hub, takeOrderSelector };
  };

  describe('constructor', () => {
    it('sets exchange', async () => {
      const {
        system: { kyberAdapter },
        config: {
          integratees: { kyber },
        },
      } = await provider.snapshot(snapshot);

      tx = kyberAdapter.EXCHANGE();
      await expect(tx).resolves.toBe(kyber);
    });

    it('sets registry', async () => {
      const {
        system: { kyberAdapter, registry },
      } = await provider.snapshot(snapshot);

      tx = kyberAdapter.REGISTRY();
      await expect(tx).resolves.toBe(registry.address);
    });
  });

  describe('parseAssetsForMethod', () => {
    // it('does not allow a bad selector', async () => {

    // });

    it('generates expected output', async () => {
      const {
        system: { kyberAdapter },
        defaultTakeOrderParams: {
          incomingAsset,
          expectedIncomingAssetAmount,
          outgoingAsset,
          outgoingAssetAmount,
        },
        takeOrderSelector,
      } = await provider.snapshot(snapshot);

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
