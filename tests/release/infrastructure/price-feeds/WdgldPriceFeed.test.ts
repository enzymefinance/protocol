import { IChainlinkAggregator, StandardToken } from '@enzymefinance/protocol';
import { deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot() {
  const {
    deployment: { wdgldPriceFeed },
    config: {
      weth,
      wdgld: { wdgld, xauusd: xauUsdAggregator, ethusd: ethUsdAggregator },
    },
  } = await deployProtocolFixture();

  return { wdgldPriceFeed, xauUsdAggregator, ethUsdAggregator, weth, wdgld };
}

describe('constructor', () => {
  it('sets initial storage vars', async () => {
    const { wdgldPriceFeed, weth, wdgld, xauUsdAggregator, ethUsdAggregator } = await provider.snapshot(snapshot);

    const storedXauAggregator = await wdgldPriceFeed.getXauAggregator();
    const storedEthAggregator = await wdgldPriceFeed.getEthAggregator();
    const storedWdgld = await wdgldPriceFeed.getWdgld();
    const storedWeth = await wdgldPriceFeed.getWeth();

    expect(storedXauAggregator).toMatchAddress(xauUsdAggregator);
    expect(storedEthAggregator).toMatchAddress(ethUsdAggregator);
    expect(storedWdgld).toMatchAddress(wdgld);
    expect(storedWeth).toMatchAddress(weth);
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying WETH', async () => {
    const {
      wdgldPriceFeed,
      xauUsdAggregator,
      ethUsdAggregator,
      weth,
      wdgld: wdgldAddress,
    } = await provider.snapshot(snapshot);
    const wdgldDecimals = 8;

    const xauToUsdRate = await new IChainlinkAggregator(xauUsdAggregator, provider).latestAnswer();
    const ethToUsdRate = await new IChainlinkAggregator(ethUsdAggregator, provider).latestAnswer();

    const wdgldToXauRate = await wdgldPriceFeed.calcWdgldToXauRate();

    const xauToWethRate = xauToUsdRate.mul(utils.parseUnits('1', 18)).div(ethToUsdRate);
    const rateToUnderlyings = await wdgldPriceFeed.calcUnderlyingValues
      .args(wdgldAddress, utils.parseUnits('1', wdgldDecimals))
      .call();

    const expectedAmount = wdgldToXauRate.mul(xauToWethRate).div(utils.parseUnits('1', 27));

    expect(rateToUnderlyings).toMatchFunctionOutput(wdgldPriceFeed.calcUnderlyingValues, {
      underlyings_: [weth],
      underlyingAmounts_: [expectedAmount],
    });
  });

  it('returns correct rate for ETH after ten years', async () => {
    const { wdgldPriceFeed } = await provider.snapshot(snapshot);
    const initialTimestamp = 1568700000;

    const tenYears = 315360000;

    await provider.send('evm_setNextBlockTimestamp', [initialTimestamp + tenYears]);
    await provider.send('evm_mine', []);

    const finalRate = await wdgldPriceFeed.calcWdgldToXauRate.call();

    // Should be around 0.0904382075 (0.99)^10 with 27 decimals
    expect(finalRate).toEqBigNumber(BigNumber.from('90438207500880449001000121'));
  });

  it('returns the expected value from the valueInterpreter', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const wdgld = new StandardToken(fork.config.wdgld.wdgld, provider);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);

    const wdgldUnit = utils.parseUnits('1', await wdgld.decimals());

    // XAU/USD price at May 31 2021 had a rate of 1850 USD. Given an approximate GTR of 0.0988 gives a value around 182.7 USD
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue.args(wdgld, wdgldUnit, usdc).call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: 171062486,
      isValid_: true,
    });
  });
});
