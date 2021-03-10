import { IMakerDaoPot, StandardToken } from '@enzymefinance/protocol';
import { ForkDeployment, loadForkDeployment } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ForkDeployment;
beforeEach(async () => {
  fork = await loadForkDeployment();
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token dai', async () => {
    const pot = new IMakerDaoPot(fork.config.chai.pot, fork.deployer);
    const chai = fork.config.chai.chai;
    const dai = fork.config.chai.dai;
    const chi = await pot.chi();

    const chaiPriceFeed = fork.deployment.ChaiPriceFeed;
    const chaiGetPriceFeedReceipt = await chaiPriceFeed.calcUnderlyingValues.args(chai, utils.parseEther('1')).call();

    expect(chaiGetPriceFeedReceipt).toMatchFunctionOutput(chaiPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [chi.div(10 ** 9)],
      underlyings_: [dai],
    });
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
    const chai = new StandardToken(fork.config.chai.chai, fork.deployer);
    const dai = new StandardToken(fork.config.chai.dai, fork.deployer);
    const valueInterpreter = fork.deployment.ValueInterpreter;

    const baseDecimals = await chai.decimals();
    const quoteDecimals = await dai.decimals();

    expect(baseDecimals).toEqBigNumber(18);
    expect(quoteDecimals).toEqBigNumber(18);

    // chai/usd price on 11/12/2020 was rated at $1.08.
    // Source: <https://www.coingecko.com/en/coins/chai/historical_data/usd?start_date=2020-11-12&end_date=2020-11-13#panel>

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(chai, utils.parseUnits('1', baseDecimals), dai)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('1018008449363110619'),
      isValid_: true,
    });
  });
});
