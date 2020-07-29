import { ethers } from 'ethers';
import { BuidlerProvider } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';
import { setupFundWithParams } from '../utils/fund';
import { assetTransferArgs, kyberTakeOrder } from '../utils/fund/integrations';
import { requestShares } from '../utils/fund/investing';

let tx;

describe('KyberAdapter', () => {
  const snapshot = async (provider: BuidlerProvider) => {
    const deployment = await provider.snapshot(configureTestDeployment());
    const denominationAsset = deployment.config.tokens.weth;

    // Deploy fund
    const fund = await setupFundWithParams({
      adapters: [deployment.system.kyberAdapter.address],
      denominationAsset: denominationAsset.address,
      factory: deployment.system.fundFactory,
      manager: deployment.config.deployer,
    });

    // Define default takeOrder config
    const takeOrderFragment = deployment.system.kyberAdapter.takeOrder.fragment;
    const takeOrderSignature = takeOrderFragment.format();
    const takeOrderSelector = deployment.system.kyberAdapter.abi.getSighash(
      takeOrderFragment,
    );
    const defaultTakeOrderParams = {
      incomingAsset: deployment.config.tokens.mln.address,
      expectedIncomingAssetAmount: ethers.utils.parseEther('1'),
      outgoingAsset: denominationAsset.address,
      outgoingAssetAmount: ethers.utils.parseEther('2'),
    };
    const defaultEncodedCallArgs = kyberTakeOrder(
      defaultTakeOrderParams.incomingAsset,
      defaultTakeOrderParams.expectedIncomingAssetAmount,
      defaultTakeOrderParams.outgoingAsset,
      defaultTakeOrderParams.outgoingAssetAmount,
    );

    // Invest in fund (immediately grants shares since it is the first investment)
    await requestShares({
      denominationAsset,
      fund,
      requestor: deployment.system.sharesRequestor,
      amount: defaultTakeOrderParams.outgoingAssetAmount,
    });

    return {
      ...deployment,
      defaultEncodedCallArgs,
      defaultTakeOrderParams,
      fund,
      takeOrderSelector,
      takeOrderSignature,
    };
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
    it('does not allow a bad selector', async () => {
      const {
        system: { kyberAdapter },
        defaultEncodedCallArgs,
        takeOrderSelector,
      } = await provider.snapshot(snapshot);

      tx = kyberAdapter.parseAssetsForMethod(
        ethers.utils.randomBytes(4),
        defaultEncodedCallArgs,
      );
      await expect(tx).rejects.toBeRevertedWith('_selector invalid');

      tx = kyberAdapter.parseAssetsForMethod(
        takeOrderSelector,
        defaultEncodedCallArgs,
      );
      await expect(tx).resolves.toBeTruthy();
    });

    it('generates expected output', async () => {
      const {
        system: { kyberAdapter },
        defaultEncodedCallArgs,
        defaultTakeOrderParams: {
          incomingAsset,
          expectedIncomingAssetAmount,
          outgoingAsset,
          outgoingAssetAmount,
        },
        takeOrderSelector,
      } = await provider.snapshot(snapshot);

      const result = await kyberAdapter.parseAssetsForMethod(
        takeOrderSelector,
        defaultEncodedCallArgs,
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
    it('can only be called by a valid fund vault', async () => {
      const {
        fund: { vault },
        system: { kyberAdapter },
        defaultEncodedCallArgs,
        takeOrderSelector,
        takeOrderSignature,
      } = await provider.snapshot(snapshot);

      const encodedTransferArgs = await assetTransferArgs(
        kyberAdapter,
        takeOrderSelector,
        defaultEncodedCallArgs,
      );

      // Reverts without a message because __isVault() asks the sender for HUB(), which an EOA doesn't have
      tx = kyberAdapter.takeOrder(defaultEncodedCallArgs, encodedTransferArgs);
      await expect(tx).rejects.toBeRevertedWith('');

      // TODO: THIS SHOULD PASS ONCE KYBER NETWORK IS ADDED TO THE ADAPTER

      // tx = vault.callOnIntegration(
      //   kyberAdapter,
      //   takeOrderSignature,
      //   defaultEncodedCallArgs,
      // );
      // await expect(tx).resolves.toBeReceipt();
    });
  });
});
