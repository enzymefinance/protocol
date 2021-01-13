import { ICERC20, StandardToken } from '@enzymefinance/protocol';
import { ForkDeployment, loadForkDeployment } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';
import hre from 'hardhat';

const gasAssertionTolerance = 0.03; // 3%
let fork: ForkDeployment;

beforeEach(async () => {
  fork = await loadForkDeployment();
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token (cERC20)', async () => {
    const compoundPriceFeed = fork.deployment.CompoundPriceFeed;
    const cdai = new ICERC20(fork.config.compound.ctokens.cdai, hre.ethers.provider);
    const dai = new StandardToken(fork.config.primitives.dai, hre.ethers.provider);

    const cTokenUnit = utils.parseUnits('1', 6);
    const getRatesReceipt = await compoundPriceFeed.calcUnderlyingValues(cdai, cTokenUnit);

    // cToken amount * stored rate / 10**18
    const expectedRate = cTokenUnit.mul(await cdai.exchangeRateStored()).div(utils.parseEther('1'));

    const feedRate = await compoundPriceFeed.calcUnderlyingValues.args(cdai, cTokenUnit).call();
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(dai);

    // Rounding up from 38938
    expect(getRatesReceipt).toCostLessThan('39000', gasAssertionTolerance);
  });

  it('returns rate for underlying token (cETH)', async () => {
    const compoundPriceFeed = fork.deployment.CompoundPriceFeed;
    const ceth = new ICERC20(fork.config.compound.ceth, hre.ethers.provider);
    const weth = new StandardToken(fork.config.weth, hre.ethers.provider);

    const cTokenUnit = utils.parseUnits('1', 6);
    const getRatesReceipt = await compoundPriceFeed.calcUnderlyingValues(ceth, cTokenUnit);

    // cToken amount * stored rate / 10**18
    const expectedRate = cTokenUnit.mul(await ceth.exchangeRateStored()).div(utils.parseEther('1'));

    const feedRate = await compoundPriceFeed.calcUnderlyingValues.args(ceth, cTokenUnit).call();
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(weth);

    // Rounding up from 30991
    expect(getRatesReceipt).toCostLessThan('32000', gasAssertionTolerance);
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
    const valueInterpreter = fork.deployment.ValueInterpreter;
    const cdai = new ICERC20(fork.config.compound.ctokens.cdai, hre.ethers.provider);
    const dai = new StandardToken(fork.config.primitives.dai, hre.ethers.provider);

    const baseDecimals = await cdai.decimals();
    const quoteDecimals = await dai.decimals();
    expect(baseDecimals).toEqBigNumber(8);
    expect(quoteDecimals).toEqBigNumber(18);

    // cDai/usd price on Jan 9, 2021 was about 0,021 USD.
    // Source: <https://www.coingecko.com/en/coins/compound-dai/historical_data/usd?start_date=2021-01-09&end_date=2021-01-09>
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(cdai, utils.parseUnits('1', baseDecimals), dai)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('20917454883850009'),
      isValid_: true,
    });
  });

  it('returns the expected value from the valueInterpreter (non 18 decimals)', async () => {
    const valueInterpreter = fork.deployment.ValueInterpreter;
    const cusdc = new ICERC20(fork.config.compound.ctokens.cusdc, hre.ethers.provider);
    const usdc = new StandardToken(fork.config.primitives.usdc, hre.ethers.provider);

    const baseDecimals = await cusdc.decimals();
    const quoteDecimals = await usdc.decimals();
    expect(baseDecimals).toEqBigNumber(8);
    expect(quoteDecimals).toEqBigNumber(6);

    // cUsdc/usd price on Jan 9, 2021 was about 0,0213 USD.
    // source: https://www.coingecko.com/en/coins/compound-usd-coin/historical_data/usd?start_date=2021-01-09&end_date=2021-01-09>
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(cusdc, utils.parseUnits('1', baseDecimals), usdc)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('21416'),
      isValid_: true,
    });
  });
});
