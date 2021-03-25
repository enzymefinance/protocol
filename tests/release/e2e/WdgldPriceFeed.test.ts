import { IChainlinkAggregator, StandardToken } from '@enzymefinance/protocol';
import {
  addTrackedAssets,
  buyShares,
  createNewFund,
  ProtocolDeployment,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('derivative gas costs', () => {
  it('adds to calcGav for weth-denominated fund', async () => {
    const [fundOwner, investor] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const wdgld = new StandardToken(fork.config.wdgld.wdgld, whales.wdgld);
    const denominationAsset = weth;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
    });

    // Seed investor and buy shares to add denomination asset
    await weth.transfer(investor, utils.parseEther('1'));

    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [utils.parseEther('1')],
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav(true)).gasUsed;

    // Seed fund and manually addTrackedAssets
    const wdgldUnit = utils.parseUnits('1', await wdgld.decimals());
    await wdgld.transfer(vaultProxy, wdgldUnit);
    await addTrackedAssets({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      trackedAssetsAdapter: fork.deployment.trackedAssetsAdapter,
      incomingAssets: [wdgld],
    });

    // Get the calcGav() cost including wdgld
    const calcGavWithToken = await comptrollerProxy.calcGav(true);

    // Assert gas
    expect(calcGavWithToken).toCostLessThan(calcGavBaseGas.add(38000));
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token weth', async () => {
    const wdgldPriceFeed = fork.deployment.wdgldPriceFeed;
    const wdgld = new StandardToken(fork.config.wdgld.wdgld, provider);
    const weth = new StandardToken(fork.config.weth, provider);
    const xauAggregator = new IChainlinkAggregator(fork.config.wdgld.xauusd, provider);
    const ethUSDAggregator = new IChainlinkAggregator(fork.config.wdgld.ethusd, provider);

    const xauToUsdRate = await xauAggregator.latestAnswer();
    const ethToUsdRate = await ethUSDAggregator.latestAnswer();

    const wdgldToXauRate = await wdgldPriceFeed.calcWdgldToXauRate();

    const wdgldUnit = utils.parseUnits('1', await wdgld.decimals());

    const underlyingValues = await wdgldPriceFeed.calcUnderlyingValues.args(wdgld, wdgldUnit).call();
    // 10**17 is a combination of ETH_UNIT / WDGLD_UNIT * GTR_PRECISION
    const expectedAmount = wdgldUnit
      .mul(wdgldToXauRate)
      .mul(xauToUsdRate)
      .div(ethToUsdRate)
      .div(utils.parseUnits('1', 17));

    expect(underlyingValues.underlyings_[0]).toMatchAddress(weth);
    expect(underlyingValues.underlyingAmounts_[0]).toEqBigNumber(expectedAmount);
  });

  it('returns the expected value from the valueInterpreter', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const wdgld = new StandardToken(fork.config.wdgld.wdgld, provider);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);

    const wdgldUnit = utils.parseUnits('1', await wdgld.decimals());

    // XAU/USD price at Jan 17, 2021 had a rate of 1849 USD. Given an approximate GTR of 0.0988xx gives a value around 182 USD
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue.args(wdgld, wdgldUnit, usdc).call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: 180795013,
      isValid_: true,
    });
  });
});
