import { randomAddress } from '@enzymefinance/ethers';
import type { FiduPriceFeed } from '@enzymefinance/protocol';
import { ITestGoldfinchConfig, ITestGoldfinchSeniorPool, ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture, getAssetUnit } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
let fiduPriceFeed: FiduPriceFeed;
let fidu: ITestStandardToken, usdc: ITestStandardToken;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  fiduPriceFeed = fork.deployment.fiduPriceFeed;

  fidu = new ITestStandardToken(fork.config.goldfinch.fidu, provider);
  usdc = new ITestStandardToken(fork.config.primitives.usdc, provider);
});

describe('calcUnderlyingValues', () => {
  it('returns the correct rate for underlying token', async () => {
    const fiduTokenUnit = await getAssetUnit(fidu);
    const usdcTokenUnit = await getAssetUnit(usdc);
    const fiduAmount = fiduTokenUnit;

    const goldfinchSeniorPool = new ITestGoldfinchSeniorPool(fork.config.goldfinch.seniorPool, provider);
    const goldfinchConfig = new ITestGoldfinchConfig(await goldfinchSeniorPool.config(), provider);

    // https://github.com/goldfinch-eng/goldfinch-contracts/blob/main/V2.2/protocol/core/ConfigOptions.sol#L20
    const withdrawFeeDenominator = await goldfinchConfig.getNumber(4);

    // convert the raw amount of fidu to usdc
    const usdcRawAmount = (await goldfinchSeniorPool.sharePrice())
      .mul(fiduAmount)
      .div(fiduTokenUnit)
      .div(fiduTokenUnit.div(usdcTokenUnit));
    // calculate the withdraw fee
    const usdcWithdrawFee = usdcRawAmount.div(withdrawFeeDenominator);

    const usdcExpectedPrice = usdcRawAmount.sub(usdcWithdrawFee);

    const calcUnderlyingValuesRes = await fiduPriceFeed.calcUnderlyingValues.args(fidu, fiduAmount).call();

    expect(calcUnderlyingValuesRes.underlyingAmounts_[0]).toEqBigNumber(usdcExpectedPrice);
    expect(calcUnderlyingValuesRes.underlyings_[0]).toMatchAddress(usdc);
  });
});

describe('isSupportedAsset', () => {
  it('unhappy path: not supported asset', async () => {
    expect(await fiduPriceFeed.isSupportedAsset(randomAddress())).toBe(false);
  });

  it('happy path', async () => {
    expect(await fiduPriceFeed.isSupportedAsset(fidu)).toBe(true);
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter', async () => {
    const fiduAmount = await getAssetUnit(fidu);
    const valueInterpreter = fork.deployment.valueInterpreter;

    // Get value in terms of invariant proxy asset for easy comparison
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue.args(fidu, fiduAmount, usdc).call();

    // Should be slightly more than 1 unit of USDC (10^6)
    expect(canonicalAssetValue).toEqBigNumber('1105050');
  });
});
