import { randomAddress } from '@enzymefinance/ethers';
import { StandardToken } from '@enzymefinance/protocol';
import { ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('addDerivatives', () => {
  it('correctly adds an existing aToken to the derivativeRegistry', async () => {
    const aavePriceFeed = fork.deployment.aavePriceFeed;
    const derivatives = ['0x101cc05f4A51C0319f570d5E146a8C625198e636']; // aTUSD
    const underlyings = ['0x0000000000085d4780b73119b644ae5ecd22b376']; // TUSD
    await aavePriceFeed.addDerivatives(derivatives, underlyings);
  });

  it('reverts when adding an invalid underlying token to the derivativeRegistry', async () => {
    const aavePriceFeed = fork.deployment.aavePriceFeed;
    const derivatives = ['0x101cc05f4A51C0319f570d5E146a8C625198e636']; // aTUSD
    const underlyings = [fork.config.primitives.dai];
    await expect(aavePriceFeed.addDerivatives(derivatives, underlyings)).rejects.toBeRevertedWith(
      'Invalid aToken or token provided',
    );
  });

  // TODO: Move this assertion to unit tests
  it('reverts when adding an invalid aToken to the derivativeRegistry', async () => {
    const aavePriceFeed = fork.deployment.aavePriceFeed;
    const derivatives = [randomAddress()];
    const underlyings = [fork.config.aave.atokens.ausdc[0]];
    await expect(aavePriceFeed.addDerivatives(derivatives, underlyings)).rejects.toBeRevertedWith(
      'function call to a non-contract account',
    );
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token USDC', async () => {
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], fork.deployer);
    const oneUnit = utils.parseUnits('1', await ausdc.decimals());

    const aavePriceFeed = fork.deployment.aavePriceFeed;
    const underlyingValues = await aavePriceFeed.calcUnderlyingValues.args(ausdc, oneUnit).call();

    expect(underlyingValues).toMatchFunctionOutput(aavePriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [oneUnit],
      underlyings_: [fork.config.primitives.usdc],
    });
  });

  // TODO: Move this assertion to unit tests
  it('only supports atokens', async () => {
    const invalidAddress = randomAddress();
    const aavePriceFeed = fork.deployment.aavePriceFeed;

    await expect(aavePriceFeed.calcUnderlyingValues.args(invalidAddress, 1).call()).rejects.toBeRevertedWith(
      'Not a supported derivative',
    );
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const adai = new StandardToken(fork.config.aave.atokens.adai[0], provider);
    const dai = new StandardToken(fork.config.primitives.dai, provider);

    const baseDecimals = await adai.decimals();
    const quoteDecimals = await dai.decimals();
    expect(baseDecimals).toEqBigNumber(18);
    expect(quoteDecimals).toEqBigNumber(18);

    // aDAI should always be pegged to dai price. Thus, its value should be exactly 1 DAI
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(adai, utils.parseUnits('1', baseDecimals), dai)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      isValid_: true,
      value_: utils.parseUnits('1', quoteDecimals),
    });
  });

  it('returns the expected value from the valueInterpreter (non 18 decimals)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);

    const baseDecimals = await ausdc.decimals();
    const quoteDecimals = await usdc.decimals();

    expect(baseDecimals).toEqBigNumber(6);
    expect(quoteDecimals).toEqBigNumber(6);

    // aUSDC should always be pegged to dai price. Thus, its value should be exactly 1 USDC
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(ausdc, utils.parseUnits('1', baseDecimals), usdc)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: utils.parseUnits('1', quoteDecimals),
      isValid_: true,
    });
  });
});
