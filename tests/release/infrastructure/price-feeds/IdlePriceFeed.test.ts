import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import { ITestIdleTokenV4, ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  buyShares,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  idleLend,
  seedAccount,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

const idleTokenUnit = utils.parseEther('1');
let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const idlePriceFeed = fork.deployment.idlePriceFeed;

    // Assert each derivative is properly registered
    for (const idleTokenAddress of Object.values(fork.config.idle) as AddressLike[]) {
      const idleToken = new ITestIdleTokenV4(idleTokenAddress, provider);

      expect(await idlePriceFeed.isSupportedAsset(idleToken)).toBe(true);
      expect(await idlePriceFeed.getUnderlyingForDerivative(idleToken)).toMatchAddress(await idleToken.token());
    }

    // SingleUnderlyingDerivativeRegistryMixin
    expect(await idlePriceFeed.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);
  });
});

describe('addDerivatives', () => {
  // The "happy path" is tested in the constructor() tests

  it('reverts when using an invalid underlying token', async () => {
    const idlePriceFeed = fork.deployment.idlePriceFeed;
    const idleToken = new ITestIdleTokenV4(fork.config.idle.bestYieldIdleDai, provider);

    // De-register valid idleToken
    await idlePriceFeed.removeDerivatives([idleToken]);
    expect(await idlePriceFeed.isSupportedAsset(idleToken)).toBe(false);

    await expect(idlePriceFeed.addDerivatives([idleToken], [randomAddress()])).rejects.toBeRevertedWith(
      'Invalid underlying for IdleToken',
    );
  });

  it('reverts when adding an invalid idleToken', async () => {
    await expect(
      fork.deployment.idlePriceFeed.addDerivatives([randomAddress()], [randomAddress()]),
    ).rejects.toBeReverted();
  });
});

describe('calcUnderlyingValues', () => {
  it('returns the correct rate for underlying token (18-decimal underlying)', async () => {
    const idlePriceFeed = fork.deployment.idlePriceFeed;
    const idleToken = new ITestIdleTokenV4(fork.config.idle.bestYieldIdleDai, provider);
    const underlying = new ITestStandardToken(await idleToken.token(), provider);

    expect(await underlying.decimals()).toEqBigNumber(18);

    const feedRate = await idlePriceFeed.calcUnderlyingValues.args(idleToken, idleTokenUnit).call();
    const expectedRateAmount = idleTokenUnit.mul(await idleToken.tokenPrice()).div(idleTokenUnit);

    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRateAmount);
    expect(feedRate.underlyings_[0]).toMatchAddress(underlying);
  });

  it('returns the correct rate for underlying token (non 18-decimal underlying)', async () => {
    const idlePriceFeed = fork.deployment.idlePriceFeed;
    const idleToken = new ITestIdleTokenV4(fork.config.idle.bestYieldIdleUsdt, provider);
    const underlying = new ITestStandardToken(await idleToken.token(), provider);

    expect(await underlying.decimals()).not.toEqBigNumber(18);

    const feedRate = await idlePriceFeed.calcUnderlyingValues.args(idleToken, idleTokenUnit).call();
    const expectedRateAmount = idleTokenUnit.mul(await idleToken.tokenPrice()).div(idleTokenUnit);

    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRateAmount);
    expect(feedRate.underlyings_[0]).toMatchAddress(underlying);
  });
});

describe('isSupportedAsset', () => {
  it('returns false for a random asset', async () => {
    const idlePriceFeed = fork.deployment.idlePriceFeed;

    expect(await idlePriceFeed.isSupportedAsset(randomAddress())).toBe(false);
  });

  it('returns true for an idleToken', async () => {
    const idlePriceFeed = fork.deployment.idlePriceFeed;

    expect(await idlePriceFeed.isSupportedAsset(fork.config.idle.bestYieldIdleDai)).toBe(true);
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18-decimal underlying)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const idleDai = new ITestStandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const dai = new ITestStandardToken(fork.config.primitives.dai, provider);

    expect(await dai.decimals()).toEqBigNumber(18);

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue.args(idleDai, idleTokenUnit, dai).call();

    // Value should be a small percentage above 1 unit of the underlying
    expect(canonicalAssetValue).toBeAroundBigNumber('1055046802123867539', '0.03');
  });

  it('returns the expected value from the valueInterpreter (non 18-decimal underlying)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const idleUsdt = new ITestStandardToken(fork.config.idle.bestYieldIdleUsdt, provider);
    const usdt = new ITestStandardToken(fork.config.primitives.usdt, provider);

    expect(await usdt.decimals()).not.toEqBigNumber(18);

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(idleUsdt, idleTokenUnit, usdt)
      .call();

    // Value should be a small percentage above 1 unit of the underlying
    expect(canonicalAssetValue).toBeAroundBigNumber('1080460');
  });
});

describe('derivative gas costs', () => {
  it('adds to calcGav for weth-denominated fund', async () => {
    const idleToken = new ITestStandardToken(fork.config.idle.bestYieldIdleDai, provider);
    const dai = new ITestStandardToken(fork.config.primitives.dai, provider);
    const weth = new ITestStandardToken(fork.config.weth, provider);
    const denominationAsset = weth;
    const [fundOwner, investor] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Buy shares to add denomination asset
    await buyShares({
      provider,
      buyer: investor,
      comptrollerProxy,
      denominationAsset,
      seedBuyer: true,
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav()).gasUsed;

    // Seed the fund with dai and use to receive an idleToken balance
    const amount = await getAssetUnit(dai);

    await seedAccount({ account: vaultProxy, amount, provider, token: dai });
    await idleLend({
      comptrollerProxy,
      fundOwner,
      idleAdapter: fork.deployment.idleAdapter,
      idleToken,
      integrationManager: fork.deployment.integrationManager,
      outgoingUnderlyingAmount: amount,
    });

    // Get the calcGav() cost including the idleToken
    const calcGavWithTokenGas = (await comptrollerProxy.calcGav()).gasUsed;

    // Assert gas
    expect(calcGavWithTokenGas.sub(calcGavBaseGas)).toMatchInlineGasSnapshot(`147236`);
  });
});
