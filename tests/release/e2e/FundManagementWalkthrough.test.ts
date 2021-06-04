import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
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
} from '@enzymefinance/protocol';
import {
  addTrackedAssets,
  buyShares,
  createNewFund,
  ProtocolDeployment,
  KyberNetworkProxy,
  kyberTakeOrder,
  deployProtocolFixture,
  redeemShares,
} from '@enzymefinance/testutils';
import { BigNumberish, utils } from 'ethers';

const expectedGasCosts = {
  'buy shares: denomination asset only: first investment': {
    usdc: 494000,
    weth: 475000,
  },
  'buy shares: denomination asset only: second investment': {
    usdc: 459000,
    weth: 450000,
  },
  'buy shares: max assets': {
    usdc: 1451000,
    weth: 1246000,
  },
  'calc gav: 20 assets': {
    usdc: 977000,
    weth: 784000,
  },
  'calc gav: denomination asset only': {
    usdc: 48000,
    weth: 44000,
  },

  'create fund': {
    usdc: 1463000,
    weth: 1456000,
  },

  'redeem all shares: max assets: all remaining': {
    usdc: 2751000,
    weth: 2588000,
  },

  'redeem partial shares: max assets': {
    usdc: 2869000,
    weth: 2664000,
  },
  // Kyber is used here because it is one of the most expensive.
  // If another adapter is significantly more expensive, we should use that one.
  'trade on Kyber: max assets': {
    usdc: 2270000,
    weth: 1662000,
  },
} as const;

describe.each([['weth' as const], ['usdc' as const]])(
  'Walkthrough for %s as denomination asset',
  (denominationAssetId) => {
    let fork: ProtocolDeployment;
    let manager: SignerWithAddress;
    let investor: SignerWithAddress;
    let anotherInvestor: SignerWithAddress;

    let comptrollerProxy: ComptrollerLib;
    let vaultProxy: VaultLib;
    let denominationAsset: StandardToken;
    let denominationAssetDecimals: BigNumberish;

    beforeAll(async () => {
      fork = await deployProtocolFixture();

      manager = fork.accounts[1];
      investor = fork.accounts[2];
      anotherInvestor = fork.accounts[3];

      denominationAsset =
        denominationAssetId === 'weth'
          ? new StandardToken(fork.config.weth, whales.weth)
          : new StandardToken(fork.config.primitives[denominationAssetId], whales[denominationAssetId]);
      denominationAssetDecimals = await denominationAsset.decimals();

      // Seed investors with denomination asset
      const denominationAssetSeedAmount = utils.parseUnits('100', await denominationAsset.decimals());
      await denominationAsset.transfer(investor, denominationAssetSeedAmount);
      await denominationAsset.transfer(anotherInvestor, denominationAssetSeedAmount);
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
        fees: [fork.deployment.managementFee, fork.deployment.performanceFee, fork.deployment.entranceRateBurnFee],
        settings: [managementFeeSettings, performanceFeeSettings, entranceRateFeeSettings],
      });

      // policies
      const maxConcentrationSettings = maxConcentrationArgs(utils.parseEther('1'));
      const adapterBlacklistSettings = adapterBlacklistArgs([fork.deployment.compoundAdapter]);
      const adapterWhitelistSettings = adapterWhitelistArgs([
        fork.deployment.kyberAdapter,
        fork.deployment.uniswapV2Adapter,
        fork.deployment.trackedAssetsAdapter,
      ]);
      const assetBlacklistSettings = assetBlacklistArgs([fork.config.primitives.knc]);

      const policyManagerConfig = policyManagerConfigArgs({
        policies: [
          fork.deployment.maxConcentration,
          fork.deployment.adapterBlacklist,
          fork.deployment.adapterWhitelist,
          fork.deployment.assetBlacklist,
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
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner: manager,
        denominationAsset,
        feeManagerConfig,
        policyManagerConfig,
      });

      comptrollerProxy = createFundTx.comptrollerProxy;
      vaultProxy = createFundTx.vaultProxy;

      expect(createFundTx.receipt).toCostLessThan(expectedGasCosts['create fund'][denominationAssetId]);
    });

    it('enables the InvestorWhitelist policy for the fund', async () => {
      const enabled = await fork.deployment.policyManager
        .connect(manager)
        .enablePolicyForFund.args(
          comptrollerProxy.address,
          fork.deployment.investorWhitelist,
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
      );
    });

    it('calculates the GAV of the fund with only the denomination asset', async () => {
      const calcGavTx = await comptrollerProxy.calcGav(true);

      expect(calcGavTx).toCostLessThan(expectedGasCosts['calc gav: denomination asset only'][denominationAssetId]);
    });

    it('trades on Kyber', async () => {
      const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, provider);

      const outgoingAsset = denominationAsset;
      const incomingAsset = new StandardToken(fork.config.primitives.dai, provider);
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
        integrationManager: fork.deployment.integrationManager,
        fundOwner: manager,
        kyberAdapter: fork.deployment.kyberAdapter,
        incomingAsset,
        minIncomingAssetAmount,
        outgoingAsset,
        outgoingAssetAmount,
      });

      const balance = await incomingAsset.balanceOf(vaultProxy);
      expect(balance).toBeGteBigNumber(minIncomingAssetAmount);
    });

    it('seeds the fund with all more assets', async () => {
      const assets = [
        new StandardToken(fork.config.primitives.bat, whales.bat),
        new StandardToken(fork.config.primitives.bnb, whales.bnb),
        new StandardToken(fork.config.primitives.bnt, whales.bnt),
        new StandardToken(fork.config.primitives.comp, whales.comp),
        new StandardToken(fork.config.primitives.link, whales.link),
        new StandardToken(fork.config.primitives.mana, whales.mana),
        new StandardToken(fork.config.primitives.mln, whales.mln),
        new StandardToken(fork.config.primitives.ren, whales.ren),
        new StandardToken(fork.config.primitives.repv2, whales.repv2),
        new StandardToken(fork.config.primitives.susd, whales.susd),
        new StandardToken(fork.config.primitives.uni, whales.uni),
        new StandardToken(fork.config.primitives.usdt, whales.usdt),
        new StandardToken(fork.config.primitives.zrx, whales.zrx),
      ];

      for (const asset of Object.values(assets)) {
        const decimals = await asset.decimals();
        const transferAmount = utils.parseUnits('1', decimals);
        await asset.transfer.args(vaultProxy, transferAmount).send();

        const balance = await asset.balanceOf(vaultProxy);
        expect(balance).toBeGteBigNumber(transferAmount);
      }

      await addTrackedAssets({
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner: manager,
        trackedAssetsAdapter: fork.deployment.trackedAssetsAdapter,
        incomingAssets: Object.values(assets),
      });
    });

    it('seeds the fund with cTokens', async () => {
      const compoundAssets = [
        new StandardToken(fork.config.compound.ctokens.ccomp, whales.ccomp),
        new StandardToken(fork.config.compound.ctokens.cdai, whales.cdai),
        new StandardToken(fork.config.compound.ceth, whales.ceth),
        new StandardToken(fork.config.compound.ctokens.cusdc, whales.cusdc),
        new StandardToken(fork.config.compound.ctokens.cuni, whales.cuni),
      ];

      for (const asset of Object.values(compoundAssets)) {
        const decimals = await asset.decimals();
        const transferAmount = utils.parseUnits('1', decimals);

        await asset.transfer.args(vaultProxy, transferAmount).send();

        const balance = await asset.balanceOf(vaultProxy);
        expect(balance).toBeGteBigNumber(transferAmount);
      }

      await addTrackedAssets({
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner: manager,
        trackedAssetsAdapter: fork.deployment.trackedAssetsAdapter,
        incomingAssets: Object.values(compoundAssets),
      });
    });

    it('calculates the GAV of the fund with 20 assets', async () => {
      expect((await vaultProxy.getTrackedAssets()).length).toBe(20);

      const calcGavTx = await comptrollerProxy.calcGav(true);

      expect(calcGavTx).toCostLessThan(expectedGasCosts['calc gav: 20 assets'][denominationAssetId]);
    });

    it('trades on Kyber again', async () => {
      const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, provider);

      const outgoingAsset = denominationAsset;
      const incomingAsset = new StandardToken(fork.config.primitives.dai, provider);
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
        integrationManager: fork.deployment.integrationManager,
        fundOwner: manager,
        kyberAdapter: fork.deployment.kyberAdapter,
        incomingAsset,
        minIncomingAssetAmount,
        outgoingAsset,
        outgoingAssetAmount,
      });

      const balance = await incomingAsset.balanceOf(vaultProxy);
      expect(balance).toBeGteBigNumber(minIncomingAssetAmount);

      expect(receipt).toCostLessThan(expectedGasCosts['trade on Kyber: max assets'][denominationAssetId]);
    });

    it("sends an asset amount to the fund's vault", async () => {
      const gavBefore = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

      const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
      const amount = utils.parseEther('1');

      await dai.transfer(vaultProxy, amount);

      const gavAfter = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueAfter = await comptrollerProxy.calcGrossShareValue.call();

      expect(gavAfter.gav_).toBeGtBigNumber(gavBefore.gav_);
      expect(grossShareValueAfter.grossShareValue_).toBeGtBigNumber(grossShareValueBefore.grossShareValue_);
    });

    it('redeems some shares of the investor (without fees failure)', async () => {
      const balance = await vaultProxy.balanceOf(investor);
      const redeemQuantity = balance.div(2);

      const redeemed = await redeemShares({
        comptrollerProxy,
        signer: investor,
        quantity: redeemQuantity,
      });

      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(balance.sub(redeemQuantity));

      const failureEvents = extractEvent(redeemed as any, 'PreRedeemSharesHookFailed');
      expect(failureEvents.length).toBe(0);

      expect(redeemed).toCostLessThan(expectedGasCosts['redeem partial shares: max assets'][denominationAssetId]);
    });

    it("sends an asset amount to the fund's vault again", async () => {
      const gavBefore = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

      const zrx = new StandardToken(fork.config.primitives.zrx, whales.zrx);
      const amount = utils.parseEther('1');

      await zrx.transfer(vaultProxy, amount);

      const gavAfter = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueAfter = await comptrollerProxy.calcGrossShareValue.call();

      expect(gavAfter.gav_).toBeGtBigNumber(gavBefore.gav_);
      expect(grossShareValueAfter.grossShareValue_).toBeGtBigNumber(grossShareValueBefore.grossShareValue_);
    });

    it('changes the InvestorWhitelist', async () => {
      await fork.deployment.policyManager
        .connect(manager)
        .updatePolicySettingsForFund.args(
          comptrollerProxy.address,
          fork.deployment.investorWhitelist,
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

      expect(buySharesTx).toCostLessThan(expectedGasCosts['buy shares: max assets'][denominationAssetId]);
    });

    it('redeems all remaining shares of the first investor (without fees failure)', async () => {
      const redeemed = await redeemShares({
        comptrollerProxy,
        signer: investor,
      });

      const failureEvents = extractEvent(redeemed as any, 'PreRedeemSharesHookFailed');
      expect(failureEvents.length).toBe(0);

      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(utils.parseEther('0'));
    });

    it('redeems all remaining shares of the other investor (without fees failure)', async () => {
      const redeemed = await redeemShares({
        comptrollerProxy,
        signer: anotherInvestor,
      });

      const failureEvents = extractEvent(redeemed as any, 'PreRedeemSharesHookFailed');
      expect(failureEvents.length).toBe(0);

      expect(await vaultProxy.balanceOf(anotherInvestor)).toEqBigNumber(utils.parseEther('0'));

      expect(redeemed).toCostLessThan(
        expectedGasCosts['redeem all shares: max assets: all remaining'][denominationAssetId],
      );
    });
  },
);
