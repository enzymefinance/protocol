import { IChainlinkAggregator, StandardToken } from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  ProtocolDeployment,
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

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
    });

    // Buy shares to add denomination asset
    await buyShares({
      comptrollerProxy,
      buyer: investor,
      denominationAsset,
      seedBuyer: true,
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav(true)).gasUsed;

    // Seed fund with wdgld and add it to tracked assets
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: [wdgld],
      amounts: [await getAssetUnit(wdgld)],
    });

    // Get the calcGav() cost including wdgld
    const calcGavWithToken = await comptrollerProxy.calcGav(true);

    // Assert gas
    expect(calcGavWithToken).toCostLessThan(calcGavBaseGas.add(65000));
  });
});

describe('constructor', () => {
  it('sets initial storage vars', async () => {
    const wdgldPriceFeed = fork.deployment.wdgldPriceFeed;

    const storedXauAggregator = await wdgldPriceFeed.getXauAggregator();
    const storedEthAggregator = await wdgldPriceFeed.getEthAggregator();
    const storedWdgld = await wdgldPriceFeed.getWdgld();
    const storedWeth = await wdgldPriceFeed.getWeth();

    expect(storedXauAggregator).toMatchAddress(fork.config.wdgld.xauusd);
    expect(storedEthAggregator).toMatchAddress(fork.config.wdgld.ethusd);
    expect(storedWdgld).toMatchAddress(fork.config.wdgld.wdgld);
    expect(storedWeth).toMatchAddress(fork.config.weth);
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

  it('returns correct rate for ETH after ten years', async () => {
    const wdgldPriceFeed = fork.deployment.wdgldPriceFeed;
    const initialTimestamp = 1568700000;

    const tenYears = 315360000;

    await provider.send('evm_setNextBlockTimestamp', [initialTimestamp + tenYears]);
    await provider.send('evm_mine', []);

    const finalRate = await wdgldPriceFeed.calcWdgldToXauRate.call();

    // Should be around 0.0904382075 (0.99)^10 with 27 decimals
    expect(finalRate).toEqBigNumber('90438207500880449001000121');
  });

  it('returns the expected value from the valueInterpreter', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const wdgld = new StandardToken(fork.config.wdgld.wdgld, provider);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);

    const wdgldUnit = utils.parseUnits('1', await wdgld.decimals());

    // XAU/USD price at July 16 2021 had a rate of 1822 USD. Given an approximate GTR of 0.0988 gives a value around 180 USD
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue.args(wdgld, wdgldUnit, usdc).call();
    expect(canonicalAssetValue).toEqBigNumber(179033367);
  });
});
