import { utils } from 'ethers';
import { BuidlerProvider } from '@crestproject/crestproject';
import { deployTestEnvironment } from '../deployment';
import {
  requestShares,
  setupFundWithParams,
  assetTransferArgs,
  chaiLendArgs,
  lendSelector,
  redeemSelector,
  chaiRedeemArgs,
  lendSignature,
  redeemSignature,
} from '../utils';

let tx;

async function snapshot(provider: BuidlerProvider) {
  const deployment = await deployTestEnvironment(provider);
  const {
    system: { chaiAdapter, sharesRequestor, fundFactory },
    config: {
      deployer,
      tokens: { dai },
    },
  } = deployment;

  // Deploy fund
  const fund = await setupFundWithParams({
    adapters: [chaiAdapter],
    factory: fundFactory,
    manager: deployer,
    denominationAsset: dai,
  });

  // Invest in fund (immediately grants shares since it is the first investment)
  await requestShares({
    denominationAsset: dai,
    fundComponents: fund,
    sharesRequestor,
    investmentAmount: utils.parseEther('100'),
  });

  return {
    ...deployment,
    fund,
  };
}

describe('ChaiAdapter', () => {
  describe('constructor', () => {
    it('sets dai and chai', async () => {
      const {
        system: { chaiAdapter },
        config: {
          tokens: { dai, chai },
        },
      } = await provider.snapshot(snapshot);

      tx = chaiAdapter.CHAI();
      await expect(tx).resolves.toBe(chai.address);
      tx = chaiAdapter.DAI();
      await expect(tx).resolves.toBe(dai.address);
    });
  });

  describe('parseAssetsForMethod', () => {
    it('does not allow a bad selector', async () => {
      const {
        system: { chaiAdapter },
      } = await provider.snapshot(snapshot);

      const args = await chaiLendArgs(1, 1);
      tx = chaiAdapter.parseAssetsForMethod(utils.randomBytes(4), args);
      await expect(tx).rejects.toBeRevertedWith('_selector invalid');

      tx = chaiAdapter.parseAssetsForMethod(lendSelector, args);
      await expect(tx).resolves.toBeTruthy();
    });

    it('generates expected output for lending', async () => {
      const {
        system: { chaiAdapter },
        config: {
          tokens: { chai, dai },
        },
      } = await provider.snapshot(snapshot);

      const incomingAsset = chai;
      const incomingAmount = utils.parseEther('1');
      const outgoingAsset = dai;
      const outgoingAmount = utils.parseEther('1');

      const args = await chaiLendArgs(incomingAmount, outgoingAmount);
      const selector = lendSelector;

      const {
        incomingAssets_,
        spendAssets_,
        spendAssetAmounts_,
        minIncomingAssetAmounts_,
      } = await chaiAdapter.parseAssetsForMethod(selector, args);

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

    it('generates expected output for redeeming', async () => {
      const {
        system: { chaiAdapter },
        config: {
          tokens: { chai, dai },
        },
      } = await provider.snapshot(snapshot);

      const incomingAsset = dai;
      const incomingAmount = utils.parseEther('1');
      const outgoingAsset = chai;
      const outgoingAmount = utils.parseEther('1');

      const args = await chaiRedeemArgs(incomingAmount, outgoingAmount);
      const selector = redeemSelector;

      const {
        incomingAssets_,
        spendAssets_,
        spendAssetAmounts_,
        minIncomingAssetAmounts_,
      } = await chaiAdapter.parseAssetsForMethod(selector, args);

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

  describe('lend', () => {
    it('can only be called by a valid fund vault', async () => {
      const {
        fund: { vault },
        system: { chaiAdapter },
      } = await provider.snapshot(snapshot);
      const amount = utils.parseEther('1');

      const lendArgs = await chaiLendArgs(amount, amount);
      const transferArgs = await assetTransferArgs(
        chaiAdapter,
        lendSelector,
        lendArgs,
      );

      // Reverts without a message because __isVault() asks the sender for HUB(), which an EOA doesn't have
      tx = chaiAdapter.lend(lendArgs, transferArgs);
      await expect(tx).rejects.toBeReverted();

      tx = vault.callOnIntegration(chaiAdapter, lendSignature, lendArgs);
      await expect(tx).resolves.toBeReceipt();
    });

    it('reverts if the incoming asset amount is too low', async () => {
      const {
        fund: { vault },
        system: { chaiAdapter },
      } = await provider.snapshot(snapshot);

      const lend = utils.parseEther('1');
      const receive = utils.parseEther('2'); // Expect to receive twice as much as the current rate.
      const lendArgs = await chaiLendArgs(lend, receive);

      tx = vault.callOnIntegration(chaiAdapter, lendSignature, lendArgs);
      await expect(tx).rejects.toBeRevertedWith(
        'received incoming asset less than expected',
      );
    });
  });

  describe('redeem', () => {
    it('can only be called by a valid fund vault', async () => {
      const {
        fund: { vault },
        system: { chaiAdapter },
      } = await provider.snapshot(snapshot);
      const amount = utils.parseEther('1');

      const redeemArgs = await chaiRedeemArgs(amount, amount);
      const transferArgs = await assetTransferArgs(
        chaiAdapter,
        redeemSelector,
        redeemArgs,
      );

      // Reverts without a message because __isVault() asks the sender for HUB(), which an EOA doesn't have
      tx = chaiAdapter.redeem(redeemArgs, transferArgs);
      await expect(tx).rejects.toBeReverted();

      // We need to lend before we can redeem.
      const lendArgs = await chaiLendArgs(amount, amount);
      tx = vault.callOnIntegration(chaiAdapter, lendSignature, lendArgs);
      await expect(tx).resolves.toBeReceipt();

      tx = vault.callOnIntegration(chaiAdapter, redeemSignature, redeemArgs);
      await expect(tx).resolves.toBeReceipt();
    });

    it('reverts if there is nothing to redeem', async () => {
      const {
        fund: { vault },
        system: { chaiAdapter },
      } = await provider.snapshot(snapshot);

      const redeem = utils.parseEther('1');
      const redeemArgs = await chaiRedeemArgs(redeem, redeem);

      tx = vault.callOnIntegration(chaiAdapter, redeemSignature, redeemArgs);
      await expect(tx).rejects.toBeRevertedWith(
        'transfer amount exceeds balance',
      );
    });
  });
});
