import { StandardToken } from '@enzymefinance/protocol';
import { ForkDeployment, loadForkDeployment } from '@enzymefinance/testutils';
import { utils } from 'ethers';
import hre from 'hardhat';

let fork: ForkDeployment;

beforeEach(async () => {
  fork = await loadForkDeployment();
});

describe('calcUnderlyingValues', () => {
  it('returns same quantity of underlying token', async () => {
    const stakehoundEthPriceFeed = fork.deployment.StakehoundEthPriceFeed;
    const derivativeToken = new StandardToken(fork.config.stakehound.steth, hre.ethers.provider);
    const underlyingToken = new StandardToken(fork.config.weth, hre.ethers.provider);

    expect(
      await stakehoundEthPriceFeed.calcUnderlyingValues
        .args(derivativeToken, utils.parseUnits('1', await derivativeToken.decimals()))
        .call(),
    ).toMatchFunctionOutput(stakehoundEthPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [utils.parseUnits('1', await underlyingToken.decimals())],
      underlyings_: [underlyingToken],
    });
  });
});

describe('expected values', () => {
  it('returns same quantity of underlying token from the valueInterpreter', async () => {
    const valueInterpreter = fork.deployment.ValueInterpreter;
    const derivativeToken = new StandardToken(fork.config.stakehound.steth, hre.ethers.provider);
    const underlyingToken = new StandardToken(fork.config.weth, hre.ethers.provider);

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(derivativeToken, utils.parseUnits('1', await derivativeToken.decimals()), underlyingToken)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: utils.parseUnits('1', await underlyingToken.decimals()),
      isValid_: true,
    });
  });
});
