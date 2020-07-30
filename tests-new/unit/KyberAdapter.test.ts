import { utils } from 'ethers';
import { BuidlerProvider } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';
import {
  assetTransferArgs,
  kyberTakeOrderArgs,
  takeOrderSelector,
  takeOrderSignature,
  requestShares,
  setupFundWithParams,
} from '../utils';

let tx;

describe('KyberAdapter', () => {
  const snapshot = async (provider: BuidlerProvider) => {
    const deployment = await provider.snapshot(configureTestDeployment());
    const {
      system: { kyberAdapter, sharesRequestor, fundFactory },
      config: {
        deployer,
        tokens: { weth },
      },
    } = deployment;

    // Deploy fund
    const fund = await setupFundWithParams({
      adapters: [kyberAdapter],
      factory: fundFactory,
      manager: deployer,
      denominationAsset: weth,
    });

    // Invest in fund (immediately grants shares since it is the first investment)
    await requestShares({
      denominationAsset: weth,
      fundComponents: fund,
      sharesRequestor,
    });

    return {
      ...deployment,
      fund,
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
        config: {
          tokens: { mln, weth },
        },
      } = await provider.snapshot(snapshot);

      const args = await kyberTakeOrderArgs(mln, 1, weth, 1);
      tx = kyberAdapter.parseAssetsForMethod(utils.randomBytes(4), args);
      await expect(tx).rejects.toBeRevertedWith('_selector invalid');

      tx = kyberAdapter.parseAssetsForMethod(takeOrderSelector, args);
      await expect(tx).resolves.toBeTruthy();
    });

    it('generates expected output', async () => {
      const {
        system: { kyberAdapter },
        config: {
          tokens: { mln, weth },
        },
      } = await provider.snapshot(snapshot);

      const incomingAsset = mln;
      const incomingAmount = utils.parseEther('1');
      const outgoingAsset = weth;
      const outgoingAmount = utils.parseEther('1');

      const encodedTakeOrderArgs = await kyberTakeOrderArgs(
        incomingAsset,
        incomingAmount,
        outgoingAsset,
        outgoingAmount,
      );

      const {
        incomingAssets_,
        spendAssets_,
        spendAssetAmounts_,
        minIncomingAssetAmounts_,
      } = await kyberAdapter.parseAssetsForMethod(
        takeOrderSelector,
        encodedTakeOrderArgs,
      );

      expect({
        incomingAssets_,
        spendAssets_,
        spendAssetAmounts_,
        minIncomingAssetAmounts_,
      }).toMatchObject({
        incomingAssets_: [incomingAsset.address],
        spendAssets_: [outgoingAsset.address],
        spendAssetAmounts_: [outgoingAmount],
        minIncomingAssetAmounts_: [incomingAmount],
      });
    });
  });

  describe('takeOrder', () => {
    it('can only be called by a valid fund vault', async () => {
      const {
        fund: { vault },
        system: { kyberAdapter },
        config: {
          tokens: { mln, weth },
        },
      } = await provider.snapshot(snapshot);

      const incomingAsset = mln;
      const incomingAmount = utils.parseEther('1');
      const outgoingAsset = weth;
      const outgoingAmount = utils.parseEther('1');

      const encodedTakeOrderArgs = await kyberTakeOrderArgs(
        incomingAsset,
        incomingAmount,
        outgoingAsset,
        outgoingAmount,
      );

      const encodedTransferArgs = await assetTransferArgs(
        kyberAdapter,
        takeOrderSelector,
        encodedTakeOrderArgs,
      );

      // Reverts without a message because __isVault() asks the sender for HUB(), which an EOA doesn't have
      tx = kyberAdapter.takeOrder(encodedTakeOrderArgs, encodedTransferArgs);
      await expect(tx).rejects.toBeReverted();

      tx = vault.callOnIntegration(
        kyberAdapter,
        takeOrderSignature,
        encodedTakeOrderArgs,
      );
      await expect(tx).resolves.toBeReceipt();
    });
  });
});
