import { IChainlinkAggregator, StandardToken } from '@enzymefinance/protocol';
import { ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
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

    const wdgldUnit = utils.parseUnits('1', 8);

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

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(wdgld, utils.parseUnits('1', 8), usdc)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: 185936532,
      isValid_: true,
    });
  });
});
