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
  UniswapV2Router,
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
  uniswapV2TakeOrder,
} from '@melonproject/testutils';
import { utils } from 'ethers';

export type Snapshot = ReturnType<typeof snapshot> extends Promise<infer T> ? T : never;

// [x] Create fund with all policies (use backlists instead of whitelists) and all three fees
// [x] deploy an investor whitelist
// [x] Invest in fund as an investor (not manager)
// [x] Trade on Kyber
// [x] Trade on Uniswap
// [ ] Lend/Redeem Chai (TODO: fix mainnet fork deployment)
// [x] Seed the fund with 19 assets (both derivatives and assets; transfer tokens and use addTrackedAssets())
// [x] Trade for 20th asset on Kyber (should be most expensive)
// [x] Trade on Uniswap again
// [ ] Lend/Redeem Chai again (TODO: fix mainnet fork deployment)
// [x] (Warp time) and send more of any asset to the fund's vault (will increase GAV)
// [x] Redeem some shares
// [x] (Warp time) and send more of any asset to the fund's vault (will increase GAV)
// [x] change investor whitelist
// [x] Buy more shares
// [x] Redeem all remaining shares

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe("Walkthrough a fund's lifecycle", () => {
  let config: ForkReleaseDeploymentConfig;
  let deployment: Snapshot['deployment'];

  let manager: SignerWithAddress;
  let investor: SignerWithAddress;
  let anotherInvestor: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib;
  let vaultProxy: VaultLib;
  let denominationAsset: StandardToken;

  beforeAll(async () => {
    const forkSnapshot = await provider.snapshot(snapshot);

    manager = forkSnapshot.accounts[0];
    investor = forkSnapshot.accounts[1];
    anotherInvestor = forkSnapshot.accounts[2];
    deployment = forkSnapshot.deployment;
    config = forkSnapshot.config;
  });

  it('creates a new fund', async () => {
    denominationAsset = config.tokens.weth;

    // fees
    const rate = 0.01;
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
      settings: [maxConcentrationSettings, adapterBlacklistSettings, adapterWhitelistSettings, assetBlacklistSettings],
    });

    const createFundTx = await createNewFund({
      signer: manager,
      fundDeployer: deployment.fundDeployer,
      fundOwner: manager,
      denominationAsset,
      feeManagerConfig,
      policyManagerConfig,
    });

    expect(createFundTx.receipt).toCostLessThan(`680000`);

    comptrollerProxy = createFundTx.comptrollerProxy;
    vaultProxy = createFundTx.vaultProxy;
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
    const investmentAmount = utils.parseEther('1');
    const minSharesAmount = utils.parseEther('0.00000000001');

    const buySharesArgs = {
      investmentAmount,
      amguValue: investmentAmount,
      minSharesAmount,
    };

    const buySharesTx = await buyShares({
      comptrollerProxy,
      signer: investor,
      buyer: investor,
      denominationAsset,
      ...buySharesArgs,
    });

    expect(buySharesTx).toCostLessThan(340000);

    const rate = utils.parseEther('0.05');
    const rateDivisor = utils.parseEther('1');
    const expectedFee = utils.parseEther('1').mul(rate).div(rateDivisor.add(rate));

    expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(utils.parseEther('1').sub(expectedFee));
  });

  it('buys more shares of a fund', async () => {
    const previousBalance = await vaultProxy.balanceOf(investor);

    const investmentAmount = utils.parseEther('1');
    const minSharesAmount = utils.parseEther('0.00000000001');

    const buySharesArgs = {
      investmentAmount,
      amguValue: utils.parseEther('1'),
      minSharesAmount,
    };

    const buySharesTx = await buyShares({
      comptrollerProxy,
      signer: investor,
      buyer: investor,
      denominationAsset,
      ...buySharesArgs,
    });

    expect(buySharesTx).toCostLessThan(380000);
    expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(minSharesAmount.add(previousBalance));
  });

  it('calculates the GAV of the fund with only the denomination asset', async () => {
    const calcGavTx = await comptrollerProxy.calcGav();

    expect(calcGavTx).toCostLessThan(`53000`);
  });

  it('trades on Kyber', async () => {
    const kyberNetworkProxy = new KyberNetworkProxy(config.integratees.kyber, provider);

    const outgoingAsset = config.tokens.weth;
    const incomingAsset = config.tokens.dai;
    const outgoingAssetAmount = utils.parseEther('0.1');

    const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);
    expect(expectedRate).toBeGtBigNumber(0);

    const minIncomingAssetAmount = expectedRate.mul(outgoingAssetAmount).div(utils.parseEther('1'));

    const takeOrder = await kyberTakeOrder({
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

    // Bumped from 1022790
    expect(takeOrder).toCostLessThan(1023000);

    const balance = await incomingAsset.balanceOf(vaultProxy);
    expect(balance).toBeGteBigNumber(minIncomingAssetAmount);
  });

  it('trades on Uniswap', async () => {
    const outgoingAssetAmount = utils.parseEther('0.1');

    const path = [config.tokens.weth, config.tokens.rep];
    const routerContract = new UniswapV2Router(config.integratees.uniswapV2.router, provider);
    const amountsOut = await routerContract.getAmountsOut(outgoingAssetAmount, path);

    const takeOrder = await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: deployment.integrationManager,
      fundOwner: manager,
      uniswapV2Adapter: deployment.uniswapV2Adapter,
      path,
      minIncomingAssetAmount: amountsOut[1],
      outgoingAssetAmount,
    });

    // Bumped from 655885
    expect(takeOrder).toCostLessThan(`656000`);
  });

  it('lends and redeems Chai', async () => {
    const chai = new StandardToken(config.derivatives.chai, provider);
    const daiAmount = utils.parseEther('1');

    const lend = await chaiLend({
      comptrollerProxy,
      vaultProxy,
      integrationManager: deployment.integrationManager,
      fundOwner: manager,
      chaiAdapter: deployment.chaiAdapter,
      dai: config.tokens.dai,
      daiAmount,
      minChaiAmount: daiAmount.mul(90).div(100),
    });

    // Bumped from 767466
    expect(lend).toCostLessThan(`768000`);

    const chaiAmount = await chai.balanceOf(vaultProxy);

    const redeem = await chaiRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager: deployment.integrationManager,
      fundOwner: manager,
      chai,
      chaiAdapter: deployment.chaiAdapter,
      chaiAmount,
      minDaiAmount: chaiAmount.mul(90).div(100),
    });

    // Bumped from 611575
    expect(redeem).toCostLessThan(`612000`);
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
      config.tokens.uni,
      config.tokens.usdc,
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

  it('calculates the GAV of the fund with 14 assets', async () => {
    const calcGavTx = await comptrollerProxy.calcGav();

    // Bumped from 634753
    expect(calcGavTx).toCostLessThan(`635000`);
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
    const calcGavTx = await comptrollerProxy.calcGav();

    // Bumped from 1043853
    expect(calcGavTx).toCostLessThan(1044000);
  });

  it('trades on Kyber again', async () => {
    const kyberNetworkProxy = new KyberNetworkProxy(config.integratees.kyber, provider);

    const outgoingAsset = config.tokens.weth;
    const incomingAsset = config.tokens.dai;
    const outgoingAssetAmount = utils.parseEther('0.1');

    const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);
    expect(expectedRate).toBeGteBigNumber(0);

    const minIncomingAssetAmount = expectedRate.mul(outgoingAssetAmount).div(utils.parseEther('1'));

    const takeOrder = await kyberTakeOrder({
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

    // Bumped from 2000211
    expect(takeOrder).toCostLessThan(2001000);

    const balance = await incomingAsset.balanceOf(vaultProxy);
    expect(balance).toBeGteBigNumber(minIncomingAssetAmount);
  });

  it('trades on Uniswap again', async () => {
    const outgoingAssetAmount = utils.parseEther('0.1');

    const path = [config.tokens.weth, config.tokens.rep];
    const routerContract = new UniswapV2Router(config.integratees.uniswapV2.router, provider);
    const amountsOut = await routerContract.getAmountsOut(outgoingAssetAmount, path);

    const takeOrder = await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: deployment.integrationManager,
      fundOwner: manager,
      uniswapV2Adapter: deployment.uniswapV2Adapter,
      path,
      minIncomingAssetAmount: amountsOut[1],
      outgoingAssetAmount,
    });

    // Bumped from 1538992
    expect(takeOrder).toCostLessThan(1539000);
  });

  it("sends an asset amount to the fund's vault", async () => {
    const gavBefore = await comptrollerProxy.calcGav.call();
    const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

    const asset = config.tokens.dai;
    const amount = utils.parseEther('1');

    await asset.connect(manager).transfer(vaultProxy, amount);

    const gavAfter = await comptrollerProxy.calcGav.call();
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

    // Bumped from 2429233
    expect(redeemed).toCostLessThan(2430000);
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(balance.sub(redeemQuantity));
  });

  it("sends an asset amount to the fund's vault again", async () => {
    const gavBefore = await comptrollerProxy.calcGav.call();
    const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

    const asset = config.tokens.zrx;
    const amount = utils.parseEther('1');

    await asset.connect(manager).transfer(vaultProxy, amount);

    const gavAfter = await comptrollerProxy.calcGav.call();
    const grossShareValueAfter = await comptrollerProxy.calcGrossShareValue.call();

    expect(gavAfter.gav_).toBeGtBigNumber(gavBefore.gav_);
    expect(grossShareValueAfter.grossShareValue_).toBeGtBigNumber(grossShareValueBefore.grossShareValue_);
  });

  it('changes the InvestorWhitelist', async () => {
    const updated = await deployment.policyManager
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

    expect(updated).toCostLessThan(`45000`);
  });

  it('buys shares of a fund as another investor', async () => {
    const investmentAmount = utils.parseEther('1');

    const grossShareValue = await comptrollerProxy.calcGrossShareValue.call();
    const minSharesAmount = investmentAmount
      .mul(utils.parseEther('1'))
      .div(grossShareValue.grossShareValue_)
      .mul(95) // deduct 5% for safety
      .div(100);

    const buySharesArgs = {
      investmentAmount,
      amguValue: investmentAmount,
      minSharesAmount,
    };

    const buySharesTx = await buyShares({
      comptrollerProxy,
      signer: anotherInvestor,
      buyer: anotherInvestor,
      denominationAsset,
      ...buySharesArgs,
    });

    // Bumped from 1421116
    expect(buySharesTx).toCostLessThan(1422000);
    expect(await vaultProxy.balanceOf(anotherInvestor)).toBeGteBigNumber(minSharesAmount);
  });

  it('redeems all remaining shares of the first investor', async () => {
    const redeemed = await redeemShares({
      comptrollerProxy,
      signer: investor,
    });

    // Bumped from 2368108
    expect(redeemed).toCostLessThan(2369000);
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(utils.parseEther('0'));
  });

  it('redeems all remaining shares of the other investor', async () => {
    const redeemed = await redeemShares({
      comptrollerProxy,
      signer: anotherInvestor,
    });

    // Bumped from 2324204
    expect(redeemed).toCostLessThan(2325000);
    expect(await vaultProxy.balanceOf(anotherInvestor)).toEqBigNumber(utils.parseEther('0'));
  });
});
