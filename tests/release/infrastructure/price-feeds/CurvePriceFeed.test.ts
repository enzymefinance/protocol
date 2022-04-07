import type { AddressLike } from '@enzymefinance/ethers';
import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import { CurvePriceFeed, ICurveLiquidityPool, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, buyShares, createNewFund, curveLend, deployProtocolFixture } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('derivative gas costs', () => {
  it('adds to calcGav for weth-denominated fund', async () => {
    const [fundOwner, investor] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const denominationAsset = weth;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const initialTokenAmount = utils.parseEther('1');

    // Buy shares to add denomination asset
    await buyShares({
      buyer: investor,
      comptrollerProxy,
      denominationAsset,
      investmentAmount: initialTokenAmount,
      seedBuyer: true,
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav()).gasUsed;

    // Use max of half of the weth balance to get the Curve steth LP token
    await curveLend({
      comptrollerProxy,
      curveLiquidityAdapter: fork.deployment.curveLiquidityAdapter,
      integrationManager,
      orderedOutgoingAssetAmounts: [initialTokenAmount.div(2), 0],
      pool: fork.config.curve.pools.steth.pool,
      signer: fundOwner,
      useUnderlyings: false,
    });

    // Get the calcGav() cost including the LP token
    const calcGavWithTokenGas = (await comptrollerProxy.calcGav()).gasUsed;

    // Assert gas
    expect(calcGavWithTokenGas.sub(calcGavBaseGas)).toMatchInlineGasSnapshot(`88476`);
  });
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const curvePriceFeed = fork.deployment.curvePriceFeed;

    // FundDeployerOwnerMixin
    expect(await curvePriceFeed.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);
  });
});

describe('calcUnderlyingValues', () => {
  it('does not allow an unsupported derivative', async () => {
    await expect(fork.deployment.curvePriceFeed.calcUnderlyingValues(randomAddress(), 1)).rejects.toBeRevertedWith(
      '_derivative is not supported',
    );
  });

  it('returns correct values (18-decimal invariant asset proxy)', async () => {
    const curvePriceFeed = fork.deployment.curvePriceFeed;
    const curvePool = new ICurveLiquidityPool(fork.config.curve.pools.steth.pool, provider);
    const curveLPToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);
    const invariantProxyAsset = new StandardToken(fork.config.curve.pools.steth.invariantProxyAsset, provider);

    expect(await invariantProxyAsset.decimals()).toEqBigNumber(18);

    const lpTokenUnit = utils.parseUnits('1', await curveLPToken.decimals());
    const expectedRate = lpTokenUnit.mul(await curvePool.get_virtual_price()).div(utils.parseEther('1'));

    const calcUnderlyingValuesRes = await curvePriceFeed.calcUnderlyingValues.args(curveLPToken, lpTokenUnit).call();

    expect(calcUnderlyingValuesRes.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(calcUnderlyingValuesRes.underlyings_[0]).toMatchAddress(invariantProxyAsset);

    const calcUnderlyingValuesTx = await curvePriceFeed.calcUnderlyingValues(curveLPToken, lpTokenUnit);

    expect(calcUnderlyingValuesTx).toMatchInlineGasSnapshot(`93590`);
  });

  it('returns correct values (non 18-decimal invariant asset proxy)', async () => {
    const curvePriceFeed = fork.deployment.curvePriceFeed;

    // Curve pool: 3pool
    const curvePool = new ICurveLiquidityPool(fork.config.curve.pools['3pool'].pool, provider);
    const curveLPToken = new StandardToken(fork.config.curve.pools['3pool'].lpToken, provider);

    // USDC as invariant asset proxy
    const invariantProxyAsset = new StandardToken(fork.config.primitives.usdc, provider);

    expect(await invariantProxyAsset.decimals()).not.toEqBigNumber(18);

    const invariantProxyAssetUnit = utils.parseUnits('1', await invariantProxyAsset.decimals());
    const lpTokenUnit = utils.parseUnits('1', await curveLPToken.decimals());
    const expectedRate = lpTokenUnit
      .mul(await curvePool.get_virtual_price())
      .mul(invariantProxyAssetUnit)
      .div(utils.parseEther('1'))
      .div(utils.parseEther('1'));

    const calcUnderlyingValuesRes = await curvePriceFeed.calcUnderlyingValues.args(curveLPToken, lpTokenUnit).call();

    expect(calcUnderlyingValuesRes.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(calcUnderlyingValuesRes.underlyings_[0]).toMatchAddress(invariantProxyAsset);

    const calcUnderlyingValuesTx = await curvePriceFeed.calcUnderlyingValues(curveLPToken, lpTokenUnit);

    expect(calcUnderlyingValuesTx).toMatchInlineGasSnapshot(`60826`);
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18-decimal invariant asset proxy)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const curveLPToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);
    const invariantProxyAsset = new StandardToken(fork.config.curve.pools.steth.invariantProxyAsset, provider);

    expect(await invariantProxyAsset.decimals()).toEqBigNumber(18);

    // Get value in terms of invariant proxy asset (WETH) for easy comparison
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(curveLPToken, utils.parseEther('1'), invariantProxyAsset)
      .call();

    // Should be slightly more than 1 unit of WETH (10^18)
    expect(canonicalAssetValue).toEqBigNumber('1036302310086699090');
  });

  it('returns the expected value from the valueInterpreter (non 18-decimal invariant asset proxy)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    // Curve pool: 3pool
    const curveLPToken = new StandardToken(fork.config.curve.pools['3pool'].lpToken, provider);
    const invariantProxyAsset = new StandardToken(fork.config.primitives.usdc, provider);

    expect(await invariantProxyAsset.decimals()).not.toEqBigNumber(18);

    // Get value in terms of invariant proxy asset for easy comparison
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(curveLPToken, utils.parseEther('1'), invariantProxyAsset)
      .call();

    // Should be slightly more than 1 unit of USDC (10^6)
    expect(canonicalAssetValue).toEqBigNumber('1020540');
  });
});

describe('derivatives registry', () => {
  const randomAddressValue1 = randomAddress();
  const randomAddressValue2 = randomAddress();

  let curvePriceFeed: CurvePriceFeed;
  let randomUser: SignerWithAddress;
  let validPoolMainRegistry: AddressLike,
    validPoolMainRegistryLpToken: AddressLike,
    validPoolMainRegistryGauge: AddressLike;
  let validPoolMetapoolFactoryRegistry: AddressLike,
    validPoolMetapoolFactoryRegistryLpToken: AddressLike,
    validPoolMetapoolFactoryRegistryGauge: AddressLike;
  let invariantProxyAsset: StandardToken;

  beforeEach(async () => {
    [randomUser] = fork.accounts;

    // Deploy fresh price feed with nothing registered
    curvePriceFeed = await CurvePriceFeed.deploy(
      fork.deployer,
      fork.deployment.fundDeployer,
      fork.config.curve.addressProvider,
    );

    // aave - main registry
    validPoolMainRegistry = fork.config.curve.pools.aave.pool;
    validPoolMainRegistryLpToken = fork.config.curve.pools.aave.lpToken;
    validPoolMainRegistryGauge = fork.config.curve.pools.aave.liquidityGaugeToken;

    // mim pool - metapool factory
    validPoolMetapoolFactoryRegistry = fork.config.curve.pools.mim.pool;
    validPoolMetapoolFactoryRegistryLpToken = fork.config.curve.pools.mim.lpToken;
    validPoolMetapoolFactoryRegistryGauge = fork.config.curve.pools.mim.liquidityGaugeToken;

    // Arbitrary invariant proxy asset to use
    invariantProxyAsset = new StandardToken(fork.config.primitives.usdc, provider);
  });

  // This is the primary action for registering pool info (invariant proxy asset and lpToken),
  // and then mapping the lpTokens plus any gauge tokens to those registered pools.
  describe('addPools', () => {
    // Common to both addPools~() functions

    it('does not allow unequal array inputs', async () => {
      // Does not test all combos of array lengths

      await expect(
        curvePriceFeed.addPools(
          [validPoolMainRegistry],
          [invariantProxyAsset, constants.AddressZero],
          [validPoolMainRegistryLpToken],
          [validPoolMainRegistryGauge],
        ),
      ).rejects.toBeRevertedWith('Unequal arrays');
    });

    it('does not allow already-added pool', async () => {
      await curvePriceFeed.addPools(
        [validPoolMainRegistry],
        [invariantProxyAsset],
        [validPoolMainRegistryLpToken],
        [validPoolMainRegistryGauge],
      );

      // Repeating the registration of the same pool with new addresses should fail
      await expect(
        curvePriceFeed.addPools(
          [validPoolMainRegistry],
          [invariantProxyAsset],
          [validPoolMainRegistryLpToken],
          [validPoolMainRegistryGauge],
        ),
      ).rejects.toBeRevertedWith('Already registered');
    });

    // Unique to this function

    it('does not allow a random caller', async () => {
      await expect(
        curvePriceFeed
          .connect(randomUser)
          .addPools(
            [validPoolMainRegistry],
            [invariantProxyAsset],
            [validPoolMainRegistryLpToken],
            [validPoolMainRegistryGauge],
          ),
      ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('does not allow a pool outside of the known Curve registries', async () => {
      await expect(
        curvePriceFeed.addPools(
          [randomAddressValue1],
          [randomAddressValue1],
          [randomAddressValue1],
          [randomAddressValue1],
        ),
      ).rejects.toBeRevertedWith('Invalid inputs');
    });

    it('does not allow an lpToken that does not match the registry (main registry)', async () => {
      await expect(
        curvePriceFeed.addPools(
          [validPoolMainRegistry],
          [invariantProxyAsset],
          [randomAddressValue1],
          [validPoolMainRegistryGauge],
        ),
      ).rejects.toBeRevertedWith('Invalid inputs');
    });

    it('does not allow an lpToken that does not match the registry (metapool factory registry)', async () => {
      await expect(
        curvePriceFeed.addPools(
          [validPoolMetapoolFactoryRegistry],
          [invariantProxyAsset],
          [randomAddressValue1],
          [validPoolMetapoolFactoryRegistryGauge],
        ),
      ).rejects.toBeRevertedWith('Invalid inputs');
    });

    it('does not allow a gauge token that does not match the registry (main registry)', async () => {
      await expect(
        curvePriceFeed.addPools(
          [validPoolMainRegistry],
          [invariantProxyAsset],
          [validPoolMainRegistryLpToken],
          [randomAddressValue1],
        ),
      ).rejects.toBeRevertedWith('Invalid gauge');
    });

    it('does not allow a gauge token that does not match the registry (metapool factory registry)', async () => {
      await expect(
        curvePriceFeed.addPools(
          [validPoolMetapoolFactoryRegistry],
          [invariantProxyAsset],
          [validPoolMetapoolFactoryRegistryLpToken],
          [randomAddressValue1],
        ),
      ).rejects.toBeRevertedWith('Invalid gauge');
    });

    it('works as expected (main and metapool factory registries)', async () => {
      const invariantProxyAssetDecimals = await invariantProxyAsset.decimals();

      const receipt = await curvePriceFeed.addPools(
        [validPoolMainRegistry, validPoolMetapoolFactoryRegistry],
        [invariantProxyAsset, invariantProxyAsset],
        [validPoolMainRegistryLpToken, validPoolMetapoolFactoryRegistryLpToken],
        [validPoolMainRegistryGauge, validPoolMetapoolFactoryRegistryGauge],
      );

      // Assert pool info storage
      expect(await curvePriceFeed.getInvariantProxyAssetInfoForPool(validPoolMainRegistry)).toMatchFunctionOutput(
        curvePriceFeed.getInvariantProxyAssetInfoForPool,
        {
          asset: invariantProxyAsset,
          decimals: invariantProxyAssetDecimals,
        },
      );
      expect(
        await curvePriceFeed.getInvariantProxyAssetInfoForPool(validPoolMetapoolFactoryRegistry),
      ).toMatchFunctionOutput(curvePriceFeed.getInvariantProxyAssetInfoForPool, {
        asset: invariantProxyAsset,
        decimals: invariantProxyAssetDecimals,
      });
      expect(await curvePriceFeed.getLpTokenForPool(validPoolMainRegistry)).toMatchAddress(
        validPoolMainRegistryLpToken,
      );
      expect(await curvePriceFeed.getLpTokenForPool(validPoolMetapoolFactoryRegistry)).toMatchAddress(
        validPoolMetapoolFactoryRegistryLpToken,
      );

      // Assert pool info events
      const invariantProxyAssetForPoolSetEvents = extractEvent(receipt, 'InvariantProxyAssetForPoolSet');

      expect(invariantProxyAssetForPoolSetEvents.length === 2);
      expect(invariantProxyAssetForPoolSetEvents[0]).toMatchEventArgs({
        invariantProxyAsset: invariantProxyAsset.address,
        pool: validPoolMainRegistry,
      });
      expect(invariantProxyAssetForPoolSetEvents[1]).toMatchEventArgs({
        invariantProxyAsset: invariantProxyAsset.address,
        pool: validPoolMetapoolFactoryRegistry,
      });

      // Assert derivative storage
      expect(await curvePriceFeed.getPoolForDerivative(validPoolMainRegistryLpToken)).toMatchAddress(
        validPoolMainRegistry,
      );
      expect(await curvePriceFeed.getPoolForDerivative(validPoolMainRegistryGauge)).toMatchAddress(
        validPoolMainRegistry,
      );
      expect(await curvePriceFeed.getPoolForDerivative(validPoolMetapoolFactoryRegistryLpToken)).toMatchAddress(
        validPoolMetapoolFactoryRegistry,
      );
      expect(await curvePriceFeed.getPoolForDerivative(validPoolMetapoolFactoryRegistryGauge)).toMatchAddress(
        validPoolMetapoolFactoryRegistry,
      );

      // Assert derivative events
      const derivativeAddedEvents = extractEvent(receipt, 'DerivativeAdded');

      expect(derivativeAddedEvents.length === 4);
      expect(derivativeAddedEvents[0]).toMatchEventArgs({
        derivative: validPoolMainRegistryLpToken,
        pool: validPoolMainRegistry,
      });
      expect(derivativeAddedEvents[1]).toMatchEventArgs({
        derivative: validPoolMainRegistryGauge,
        pool: validPoolMainRegistry,
      });
      expect(derivativeAddedEvents[2]).toMatchEventArgs({
        derivative: validPoolMetapoolFactoryRegistryLpToken,
        pool: validPoolMetapoolFactoryRegistry,
      });
      expect(derivativeAddedEvents[3]).toMatchEventArgs({
        derivative: validPoolMetapoolFactoryRegistryGauge,
        pool: validPoolMetapoolFactoryRegistry,
      });
    });
  });

  describe('addPoolsWithoutValidation', () => {
    it('does not allow a random caller', async () => {
      await expect(
        curvePriceFeed
          .connect(randomUser)
          .addPoolsWithoutValidation(
            [validPoolMainRegistry],
            [invariantProxyAsset],
            [validPoolMainRegistryLpToken],
            [validPoolMainRegistryGauge],
          ),
      ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('does not allow empty lpToken param', async () => {
      await expect(
        curvePriceFeed.addPoolsWithoutValidation(
          [validPoolMainRegistry],
          [invariantProxyAsset],
          [constants.AddressZero],
          [validPoolMainRegistryGauge],
        ),
      ).rejects.toBeRevertedWith('Empty lpToken');
    });

    it('does not allow an incompatible pool (no get_virtual_price())', async () => {
      await expect(
        curvePriceFeed.addPoolsWithoutValidation(
          [randomAddressValue1],
          [invariantProxyAsset],
          [validPoolMainRegistryLpToken],
          [validPoolMainRegistryGauge],
        ),
      ).rejects.toBeReverted();
    });

    // Since __addPools() logic is the same as tested in addPools(), only need to test that invalid config can pass
    it('works as expected (main and metapool factory registries)', async () => {
      await curvePriceFeed.addPoolsWithoutValidation(
        [validPoolMainRegistry],
        [invariantProxyAsset],
        [randomAddressValue1],
        [randomAddressValue2],
      );
    });
  });

  describe('addGaugeTokens', () => {
    // Common to both addGaugeTokens~() functions

    it('does not allow unequal array inputs', async () => {
      await expect(
        curvePriceFeed.addGaugeTokens([validPoolMainRegistryGauge], [validPoolMainRegistry, constants.AddressZero]),
      ).rejects.toBeRevertedWith('Unequal arrays');
    });

    it('does not allow adding a derivative with an unregistered pool', async () => {
      await expect(
        curvePriceFeed.addGaugeTokens([validPoolMainRegistryGauge], [validPoolMainRegistry]),
      ).rejects.toBeRevertedWith('Pool not registered');
    });

    // Unique to this function

    it('does not allow a random caller', async () => {
      await expect(
        curvePriceFeed.connect(randomUser).addGaugeTokens([validPoolMainRegistryGauge], [validPoolMainRegistry]),
      ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('does not allow a gauge token that does not match the registry (main registry)', async () => {
      await expect(
        curvePriceFeed.addGaugeTokens([randomAddressValue1], [validPoolMainRegistry]),
      ).rejects.toBeRevertedWith('Invalid gauge');
    });

    it('does not allow a gauge token that does not match the registry (metapool factory registry)', async () => {
      await expect(
        curvePriceFeed.addGaugeTokens([randomAddressValue1], [validPoolMetapoolFactoryRegistry]),
      ).rejects.toBeRevertedWith('Invalid gauge');
    });

    it('works as expected (main and metapool factory registries)', async () => {
      // First add the pools without their gauges
      await curvePriceFeed.addPools(
        [validPoolMainRegistry, validPoolMetapoolFactoryRegistry],
        [invariantProxyAsset, invariantProxyAsset],
        [validPoolMainRegistryLpToken, validPoolMetapoolFactoryRegistryLpToken],
        [constants.AddressZero, constants.AddressZero],
      );

      // Add the gauges
      await curvePriceFeed.addGaugeTokens(
        [validPoolMainRegistryGauge, validPoolMetapoolFactoryRegistryGauge],
        [validPoolMainRegistry, validPoolMetapoolFactoryRegistry],
      );

      // Assert derivative storage
      expect(await curvePriceFeed.getPoolForDerivative(validPoolMainRegistryGauge)).toMatchAddress(
        validPoolMainRegistry,
      );
      expect(await curvePriceFeed.getPoolForDerivative(validPoolMetapoolFactoryRegistryGauge)).toMatchAddress(
        validPoolMetapoolFactoryRegistry,
      );

      // DerivativeAdded events are tested in addPools() tests
    });
  });

  describe('addGaugeTokensWithoutValidation', () => {
    it('does not allow a random caller', async () => {
      await expect(
        curvePriceFeed
          .connect(randomUser)
          .addGaugeTokensWithoutValidation([validPoolMainRegistryGauge], [validPoolMainRegistry]),
      ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('works as expected', async () => {
      // First add the pool without its gauge
      await curvePriceFeed.addPools(
        [validPoolMainRegistry],
        [invariantProxyAsset],
        [validPoolMainRegistryLpToken],
        [constants.AddressZero],
      );

      // Add a random gauge value
      const randomGaugeValue = randomAddressValue1;

      await curvePriceFeed.addGaugeTokensWithoutValidation([randomGaugeValue], [validPoolMainRegistry]);

      // Assert derivative storage
      expect(await curvePriceFeed.getPoolForDerivative(randomGaugeValue)).toMatchAddress(validPoolMainRegistry);
    });
  });

  describe('removeDerivatives', () => {
    it('does not allow a random caller', async () => {
      await expect(
        curvePriceFeed.connect(randomUser).removeDerivatives([validPoolMainRegistryGauge]),
      ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('works as expected', async () => {
      // First add the pool with its lpToken and gauge token
      await curvePriceFeed.addPools(
        [validPoolMainRegistry],
        [invariantProxyAsset],
        [validPoolMainRegistryLpToken],
        [validPoolMainRegistryGauge],
      );

      // Remove the gauge token
      const receipt = await curvePriceFeed.removeDerivatives([validPoolMainRegistryGauge]);

      // Assert the derivative is no longer registered
      expect(await curvePriceFeed.getPoolForDerivative(validPoolMainRegistryGauge)).toMatchAddress(
        constants.AddressZero,
      );

      // Assert the event was correctly emitted
      assertEvent(receipt, 'DerivativeRemoved', {
        derivative: validPoolMainRegistryGauge,
      });
    });
  });

  describe('removePools', () => {
    it('does not allow a random caller', async () => {
      await expect(curvePriceFeed.connect(randomUser).removePools([validPoolMainRegistry])).rejects.toBeRevertedWith(
        'Only the FundDeployer owner can call this function',
      );
    });

    it('works as expected', async () => {
      // First add the pool
      await curvePriceFeed.addPools(
        [validPoolMainRegistry],
        [invariantProxyAsset],
        [validPoolMainRegistryLpToken],
        [constants.AddressZero],
      );

      // Remove the pool
      const receipt = await curvePriceFeed.removePools([validPoolMainRegistry]);

      // Assert the pool info is removed from storage
      expect(await curvePriceFeed.getInvariantProxyAssetInfoForPool(validPoolMainRegistry)).toMatchFunctionOutput(
        curvePriceFeed.getInvariantProxyAssetInfoForPool,
        {
          asset: constants.AddressZero,
          decimals: 0,
        },
      );
      expect(await curvePriceFeed.getLpTokenForPool(validPoolMainRegistry)).toMatchAddress(constants.AddressZero);

      // Assert the event was correctly emitted
      assertEvent(receipt, 'PoolRemoved', {
        pool: validPoolMainRegistry,
      });
    });
  });

  describe('updateInvariantProxyAssets', () => {
    it('does not allow a random caller', async () => {
      await expect(
        curvePriceFeed.connect(randomUser).updateInvariantProxyAssets([validPoolMainRegistry], [invariantProxyAsset]),
      ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('works as expected', async () => {
      // First add the pool
      await curvePriceFeed.addPools(
        [validPoolMainRegistry],
        [invariantProxyAsset],
        [validPoolMainRegistryLpToken],
        [constants.AddressZero],
      );

      // Update the pool with an invariant asset proxy of different decimals
      const nextInvariantAssetProxy = new StandardToken(fork.config.primitives.mln, provider);
      const nextInvariantAssetProxyDecimals = await nextInvariantAssetProxy.decimals();

      expect(nextInvariantAssetProxyDecimals).not.toEqBigNumber(await invariantProxyAsset.decimals());

      // Set a new invariant proxy asset
      await curvePriceFeed.updateInvariantProxyAssets([validPoolMainRegistry], [nextInvariantAssetProxy]);

      // Assert the invariant proxy asset was updated
      expect(await curvePriceFeed.getInvariantProxyAssetInfoForPool(validPoolMainRegistry)).toMatchFunctionOutput(
        curvePriceFeed.getInvariantProxyAssetInfoForPool,
        {
          asset: nextInvariantAssetProxy,
          decimals: nextInvariantAssetProxyDecimals,
        },
      );

      // Event emission already tested in addPools()
    });
  });
});
