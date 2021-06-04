import { ICERC20, StandardToken } from '@enzymefinance/protocol';
import { ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token (cERC20)', async () => {
    const compoundPriceFeed = fork.deployment.compoundPriceFeed;
    const cdai = new ICERC20(fork.config.compound.ctokens.cdai, provider);
    const dai = new StandardToken(fork.config.primitives.dai, provider);

    const cTokenUnit = utils.parseUnits('1', 6);
    const getRatesReceipt = await compoundPriceFeed.calcUnderlyingValues(cdai, cTokenUnit);

    // cToken amount * stored rate / 10**18
    const expectedRate = cTokenUnit.mul(await cdai.exchangeRateStored()).div(utils.parseEther('1'));

    const feedRate = await compoundPriceFeed.calcUnderlyingValues.args(cdai, cTokenUnit).call();
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(dai);

    // Rounding up from 38938
    expect(getRatesReceipt).toCostLessThan('39000');
  });

  it('returns rate for underlying token (cETH)', async () => {
    const compoundPriceFeed = fork.deployment.compoundPriceFeed;
    const ceth = new ICERC20(fork.config.compound.ceth, provider);
    const weth = new StandardToken(fork.config.weth, provider);

    const cTokenUnit = utils.parseUnits('1', 6);
    const getRatesReceipt = await compoundPriceFeed.calcUnderlyingValues(ceth, cTokenUnit);

    // cToken amount * stored rate / 10**18
    const expectedRate = cTokenUnit.mul(await ceth.exchangeRateStored()).div(utils.parseEther('1'));

    const feedRate = await compoundPriceFeed.calcUnderlyingValues.args(ceth, cTokenUnit).call();
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(weth);

    // Rounding up from 30991
    expect(getRatesReceipt).toCostLessThan('32000');
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const cdai = new ICERC20(fork.config.compound.ctokens.cdai, provider);
    const dai = new StandardToken(fork.config.primitives.dai, provider);

    const baseDecimals = await cdai.decimals();
    const quoteDecimals = await dai.decimals();
    expect(baseDecimals).toEqBigNumber(8);
    expect(quoteDecimals).toEqBigNumber(18);

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(cdai, utils.parseUnits('1', baseDecimals), dai)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      isValid_: true,
      value_: BigNumber.from('21449480548522202'),
    });
  });

  it('returns the expected value from the valueInterpreter (non 18 decimals)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const cusdc = new ICERC20(fork.config.compound.ctokens.cusdc, provider);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);

    const baseDecimals = await cusdc.decimals();
    const quoteDecimals = await usdc.decimals();
    expect(baseDecimals).toEqBigNumber(8);
    expect(quoteDecimals).toEqBigNumber(6);

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(cusdc, utils.parseUnits('1', baseDecimals), usdc)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('22030'),
      isValid_: true,
    });
  });
});
