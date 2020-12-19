import { EthereumTestnetProvider, randomAddress, SignerWithAddress } from '@crestproject/crestproject';
import {
  adapterBlacklistArgs,
  adapterWhitelistArgs,
  assetBlacklistArgs,
  ComptrollerLib,
  convertRateToScaledPerSecondRate,
  entranceRateFeeConfigArgs,
  feeManagerConfigArgs,
  investorWhitelistArgs,
  managementFeeConfigArgs,
  maxConcentrationArgs,
  performanceFeeConfigArgs,
  policyManagerConfigArgs,
  StandardToken,
  VaultLib,
} from '@melonproject/protocol';
import {
  addTrackedAssets,
  buyShares,
  chaiLend,
  chaiRedeem,
  createNewFund,
  defaultForkDeployment,
  ForkReleaseDeploymentConfig,
  KyberNetworkProxy,
  kyberTakeOrder,
  redeemShares,
} from '@melonproject/testutils';
import { BigNumberish, utils } from 'ethers';

export type Snapshot = ReturnType<typeof snapshot> extends Promise<infer T> ? T : never;

// All values are rounded up to nearest 1000
// Note that due to the nature of `toCostLessThan()`,
const expectedGasCosts = {
  'create fund': {
    weth: 701000,
    usdc: 708000,
  },
  'buy shares: denomination asset only: first investment': {
    weth: 418000,
    usdc: 432000,
  },
  'buy shares: denomination asset only: second investment': {
    weth: 446000,
    usdc: 454000,
  },
  'calc gav: denomination asset only': {
    weth: 42000,
    usdc: 45000,
  },
  'calc gav: 20 assets': {
    weth: 843000,
    usdc: 1089000,
  },
  // Kyber is used here because it is one of the most expensive.
  // If another adapter is significantly more expensive, we should use that one.
  'trade on Kyber: max assets': {
    weth: 1729000,
    usdc: 2532000,
  },
  'redeem partial shares: max assets': {
    weth: 2138000,
    usdc: 2395000,
  },
  'buy shares: max assets': {
    weth: 1290000,
    usdc: 1602000,
  },
  'redeem all shares: max assets: all remaining': {
    weth: 1587000,
    usdc: 1814000,
  },
};
const gasAssertionTolerance = 0.03; // 3%

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe.each([['weth' as const], ['usdc' as const]])(
  'Walkthrough for %s as denomination asset',
  (denominationAssetId) => {
    let config: ForkReleaseDeploymentConfig;
    let deployment: Snapshot['deployment'];

    let manager: SignerWithAddress;
    let investor: SignerWithAddress;
    let anotherInvestor: SignerWithAddress;

    let comptrollerProxy: ComptrollerLib;
    let vaultProxy: VaultLib;
    let denominationAsset: StandardToken;
    let denominationAssetDecimals: BigNumberish;

    beforeAll(async () => {
      const forkSnapshot = await provider.snapshot(snapshot);

      manager = forkSnapshot.accounts[0];
      investor = forkSnapshot.accounts[1];
      anotherInvestor = forkSnapshot.accounts[2];
      deployment = forkSnapshot.deployment;
      config = forkSnapshot.config;

      denominationAsset = forkSnapshot.config.tokens[denominationAssetId];
      denominationAssetDecimals = await denominationAsset.decimals();
    });

    it('creates a new fund', async () => {
      // fees
      const rate = utils.parseEther('0.01');
      const scaledPerSecondRate = convertRateToScaledPerSecondRate(rate);

      const managementFeeSettings = managementFeeConfigArgs(scaledPerSecondRate);
      const performanceFeeSettings = performanceFeeConfigArgs({
        rate: utils.parseEther('0.1'),
        period: 365 * 24 * 60 * 60,
      });
      const entranceRateFeeSettings = entranceRateFeeConfigArgs(utils.parseEther('0.05'));

      const feeManagerConfig = feeManagerConfigArgs({
        fees: [deployment.managementFee, deployment.performanceFee, deployment.entranceRateBurnFee],
        settings: [managementFeeSettings, performanceFeeSettings, entranceRateFeeSettings],
      });

      // policies
      const maxConcentrationSettings = maxConcentrationArgs(utils.parseEther('1'));
      const adapterBlacklistSettings = adapterBlacklistArgs([deployment.compoundAdapter]);
      const adapterWhitelistSettings = adapterWhitelistArgs([
        deployment.kyberAdapter,
        deployment.uniswapV2Adapter,
        deployment.trackedAssetsAdapter,
        deployment.chaiAdapter,
      ]);
      const assetBlacklistSettings = assetBlacklistArgs([config.tokens.knc]);

      const policyManagerConfig = policyManagerConfigArgs({
        policies: [
          deployment.maxConcentration,
          deployment.adapterBlacklist,
          deployment.adapterWhitelist,
          deployment.assetBlacklist,
        ],
        settings: [
          maxConcentrationSettings,
          adapterBlacklistSettings,
          adapterWhitelistSettings,
          assetBlacklistSettings,
        ],
      });

      const createFundTx = await createNewFund({
        signer: manager,
        fundDeployer: deployment.fundDeployer,
        fundOwner: manager,
        denominationAsset,
        feeManagerConfig,
        policyManagerConfig,
      });

      comptrollerProxy = createFundTx.comptrollerProxy;
      vaultProxy = createFundTx.vaultProxy;

      expect(createFundTx.receipt).toCostLessThan(
        expectedGasCosts['create fund'][denominationAssetId],
        gasAssertionTolerance,
      );
    });

    it('enables the InvestorWhitelist policy for the fund', async () => {
      const enabled = await deployment.policyManager
        .connect(manager)
        .enablePolicyForFund.args(
          comptrollerProxy.address,
          deployment.investorWhitelist,
          investorWhitelistArgs({
            investorsToAdd: [randomAddress(), randomAddress(), investor.address],
          }),
        )
        .send();

      expect(enabled).toBeReceipt();
    });

    it('buys shares of a fund', async () => {
      const buySharesTx = await buyShares({
        comptrollerProxy,
        signer: investor,
        buyers: [investor],
        denominationAsset,
        investmentAmounts: [utils.parseUnits('1', denominationAssetDecimals)],
        minSharesAmounts: [utils.parseUnits('0.00001', denominationAssetDecimals)],
      });

      const rate = utils.parseEther('0.05');
      const rateDivisor = utils.parseEther('1');
      const expectedFee = utils.parseUnits('1', denominationAssetDecimals).mul(rate).div(rateDivisor.add(rate));

      expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(
        utils.parseUnits('1', denominationAssetDecimals).sub(expectedFee),
      );

      expect(buySharesTx).toCostLessThan(
        expectedGasCosts['buy shares: denomination asset only: first investment'][denominationAssetId],
        gasAssertionTolerance,
      );
    });

    it('buys more shares of a fund', async () => {
      const previousBalance = await vaultProxy.balanceOf(investor);

      const minSharesAmount = utils.parseUnits('0.00001', denominationAssetDecimals);
      const buySharesTx = await buyShares({
        comptrollerProxy,
        signer: investor,
        buyers: [investor],
        denominationAsset,
        investmentAmounts: [utils.parseUnits('1', denominationAssetDecimals)],
        minSharesAmounts: [minSharesAmount],
      });

      expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(minSharesAmount.add(previousBalance));

      expect(buySharesTx).toCostLessThan(
        expectedGasCosts['buy shares: denomination asset only: second investment'][denominationAssetId],
        gasAssertionTolerance,
      );
    });

    it('calculates the GAV of the fund with only the denomination asset', async () => {
      const calcGavTx = await comptrollerProxy.calcGav(true);

      expect(calcGavTx).toCostLessThan(
        expectedGasCosts['calc gav: denomination asset only'][denominationAssetId],
        gasAssertionTolerance,
      );
    });

    it('trades on Kyber', async () => {
      const kyberNetworkProxy = new KyberNetworkProxy(config.integratees.kyber, provider);

      const outgoingAsset = denominationAsset;
      const incomingAsset = config.tokens.dai;
      const outgoingAssetAmount = utils.parseUnits('0.1', denominationAssetDecimals);

      const { expectedRate } = await kyberNetworkProxy.getExpectedRate(
        outgoingAsset,
        incomingAsset,
        outgoingAssetAmount,
      );
      expect(expectedRate).toBeGtBigNumber(0);

      const minIncomingAssetAmount = expectedRate
        .mul(outgoingAssetAmount)
        .div(utils.parseUnits('1', denominationAssetDecimals));

      await kyberTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager: deployment.integrationManager,
        fundOwner: manager,
        kyberAdapter: deployment.kyberAdapter,
        incomingAsset,
        minIncomingAssetAmount,
        outgoingAsset,
        outgoingAssetAmount,
      });

      const balance = await incomingAsset.balanceOf(vaultProxy);
      expect(balance).toBeGteBigNumber(minIncomingAssetAmount);
    });

    it('lends and redeems Chai', async () => {
      const dai = new StandardToken(config.tokens.dai, provider);
      const chai = new StandardToken(config.derivatives.chai, provider);
      const daiAmount = await dai.balanceOf(vaultProxy);

      await chaiLend({
        comptrollerProxy,
        vaultProxy,
        integrationManager: deployment.integrationManager,
        fundOwner: manager,
        chaiAdapter: deployment.chaiAdapter,
        dai: config.tokens.dai,
        daiAmount,
        minChaiAmount: daiAmount.mul(90).div(100),
      });

      const chaiAmount = await chai.balanceOf(vaultProxy);

      await chaiRedeem({
        comptrollerProxy,
        vaultProxy,
        integrationManager: deployment.integrationManager,
        fundOwner: manager,
        chai,
        chaiAdapter: deployment.chaiAdapter,
        chaiAmount,
        minDaiAmount: chaiAmount.mul(90).div(100),
      });
    });

    it('seeds the fund with all more assets', async () => {
      const assets = [
        config.tokens.bat,
        config.tokens.bnb,
        config.tokens.bnt,
        config.tokens.comp,
        config.tokens.link,
        config.tokens.mana,
        config.tokens.ren,
        config.tokens.rep,
        config.tokens.uni,
        config.tokens.usdt,
        config.tokens.zrx,
      ];

      for (const asset of assets) {
        const decimals = await asset.decimals();
        const transferAmount = utils.parseUnits('1', decimals);

        await asset.connect(manager).transfer.args(vaultProxy, transferAmount).send();

        const balance = await asset.balanceOf(vaultProxy);
        expect(balance).toBeGteBigNumber(transferAmount);
      }

      await addTrackedAssets({
        comptrollerProxy,
        integrationManager: deployment.integrationManager,
        fundOwner: manager,
        trackedAssetsAdapter: deployment.trackedAssetsAdapter,
        incomingAssets: assets,
      });
    });

    it('seeds the fund with cTokens', async () => {
      const compoundAssets = [
        new StandardToken(config.derivatives.compound.ccomp, provider),
        new StandardToken(config.derivatives.compound.cdai, provider),
        new StandardToken(config.derivatives.compound.ceth, provider),
        new StandardToken(config.derivatives.compound.crep, provider),
        new StandardToken(config.derivatives.compound.cuni, provider),
      ];

      for (const asset of compoundAssets) {
        const decimals = await asset.decimals();
        const transferAmount = utils.parseUnits('1', decimals);

        await asset.connect(manager).transfer.args(vaultProxy, transferAmount).send();

        const balance = await asset.balanceOf(vaultProxy);
        expect(balance).toBeGteBigNumber(transferAmount);
      }

      await addTrackedAssets({
        comptrollerProxy,
        integrationManager: deployment.integrationManager,
        fundOwner: manager,
        trackedAssetsAdapter: deployment.trackedAssetsAdapter,
        incomingAssets: compoundAssets,
      });
    });

    it('calculates the GAV of the fund with 20 assets', async () => {
      const calcGavTx = await comptrollerProxy.calcGav(true);

      expect(calcGavTx).toCostLessThan(
        expectedGasCosts['calc gav: 20 assets'][denominationAssetId],
        gasAssertionTolerance,
      );
    });

    it('trades on Kyber again', async () => {
      const kyberNetworkProxy = new KyberNetworkProxy(config.integratees.kyber, provider);

      const outgoingAsset = denominationAsset;
      const incomingAsset = config.tokens.dai;
      const outgoingAssetAmount = utils.parseUnits('0.1', denominationAssetDecimals);

      const { expectedRate } = await kyberNetworkProxy.getExpectedRate(
        outgoingAsset,
        incomingAsset,
        outgoingAssetAmount,
      );
      expect(expectedRate).toBeGteBigNumber(0);

      const minIncomingAssetAmount = expectedRate
        .mul(outgoingAssetAmount)
        .div(utils.parseUnits('1', denominationAssetDecimals));

      const receipt = await kyberTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager: deployment.integrationManager,
        fundOwner: manager,
        kyberAdapter: deployment.kyberAdapter,
        incomingAsset,
        minIncomingAssetAmount,
        outgoingAsset,
        outgoingAssetAmount,
      });

      const balance = await incomingAsset.balanceOf(vaultProxy);
      expect(balance).toBeGteBigNumber(minIncomingAssetAmount);

      expect(receipt).toCostLessThan(
        expectedGasCosts['trade on Kyber: max assets'][denominationAssetId],
        gasAssertionTolerance,
      );
    });

    it("sends an asset amount to the fund's vault", async () => {
      const gavBefore = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

      const asset = config.tokens.dai;
      const amount = utils.parseEther('1');

      await asset.connect(manager).transfer(vaultProxy, amount);

      const gavAfter = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueAfter = await comptrollerProxy.calcGrossShareValue.call();

      expect(gavAfter.gav_).toBeGtBigNumber(gavBefore.gav_);
      expect(grossShareValueAfter.grossShareValue_).toBeGtBigNumber(grossShareValueBefore.grossShareValue_);
    });

    it('redeems some shares of the investor', async () => {
      const balance = await vaultProxy.balanceOf(investor);
      const redeemQuantity = balance.div(2);

      const redeemed = await redeemShares({
        comptrollerProxy,
        signer: investor,
        quantity: redeemQuantity,
      });

      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(balance.sub(redeemQuantity));

      expect(redeemed).toCostLessThan(
        expectedGasCosts['redeem partial shares: max assets'][denominationAssetId],
        gasAssertionTolerance,
      );
    });

    it("sends an asset amount to the fund's vault again", async () => {
      const gavBefore = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

      const asset = config.tokens.zrx;
      const amount = utils.parseEther('1');

      await asset.connect(manager).transfer(vaultProxy, amount);

      const gavAfter = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueAfter = await comptrollerProxy.calcGrossShareValue.call();

      expect(gavAfter.gav_).toBeGtBigNumber(gavBefore.gav_);
      expect(grossShareValueAfter.grossShareValue_).toBeGtBigNumber(grossShareValueBefore.grossShareValue_);
    });

    it('changes the InvestorWhitelist', async () => {
      await deployment.policyManager
        .connect(manager)
        .updatePolicySettingsForFund.args(
          comptrollerProxy.address,
          deployment.investorWhitelist,
          investorWhitelistArgs({
            investorsToAdd: [anotherInvestor],
            investorsToRemove: [investor],
          }),
        )
        .send();
    });

    it('buys shares of a fund as another investor', async () => {
      const investmentAmount = utils.parseUnits('1', denominationAssetDecimals);

      const grossShareValue = await comptrollerProxy.calcGrossShareValue.call();
      const minSharesAmount = investmentAmount
        .mul(utils.parseEther('1'))
        .div(grossShareValue.grossShareValue_)
        .mul(95) // deduct 5% for safety
        .div(100);

      const buySharesTx = await buyShares({
        comptrollerProxy,
        signer: anotherInvestor,
        buyers: [anotherInvestor],
        denominationAsset,
        investmentAmounts: [investmentAmount],
        minSharesAmounts: [minSharesAmount],
      });

      expect(await vaultProxy.balanceOf(anotherInvestor)).toBeGteBigNumber(minSharesAmount);

      expect(buySharesTx).toCostLessThan(
        expectedGasCosts['buy shares: max assets'][denominationAssetId],
        gasAssertionTolerance,
      );
    });

    it('redeems all remaining shares of the first investor', async () => {
      await redeemShares({
        comptrollerProxy,
        signer: investor,
      });

      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(utils.parseEther('0'));
    });

    it('redeems all remaining shares of the other investor', async () => {
      const redeemed = await redeemShares({
        comptrollerProxy,
        signer: anotherInvestor,
      });

      expect(await vaultProxy.balanceOf(anotherInvestor)).toEqBigNumber(utils.parseEther('0'));

      expect(redeemed).toCostLessThan(
        expectedGasCosts['redeem all shares: max assets: all remaining'][denominationAssetId],
        gasAssertionTolerance,
      );
    });
  },
);
