import type { ValueInterpreter } from '@enzymefinance/protocol';
import { ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture, getAssetUnit } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
let valueInterpreter: ValueInterpreter;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  valueInterpreter = fork.deployment.valueInterpreter;
});

describe('calcCanonicalAssetValue', () => {
  it.todo('re-do tests');

  it('happy path: primitive to derivative (different decimals)', async () => {
    // Use usd stablecoin pair for comprehensibility
    // Use aToken since it has same value as underlying
    const derivative = new ITestStandardToken(fork.config.aave.atokens.adai[0], provider);
    const primitive = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const derivativeUnit = await getAssetUnit(derivative);
    const primitiveUnit = await getAssetUnit(primitive);

    expect(derivativeUnit).not.toEqBigNumber(primitiveUnit);

    const multiplier = 2;

    expect(
      await valueInterpreter.calcCanonicalAssetValue.args(primitive, primitiveUnit.mul(multiplier), derivative).call(),
    ).toBeAroundBigNumber(derivativeUnit.mul(multiplier), '0.01');
  });
});

describe('calcCanonicalAssetsTotalValue', () => {
  it.todo('re-do tests');
});
