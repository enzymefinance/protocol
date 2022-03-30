import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { ICurveLiquidityPool, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { buyShares, createNewFund, curveLend, deployProtocolFixture } from '@enzymefinance/testutils';
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
    expect(calcGavWithTokenGas.sub(calcGavBaseGas)).toMatchInlineGasSnapshot(`90305`);
  });
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const curvePriceFeed = fork.deployment.curvePriceFeed;

    expect(await curvePriceFeed.getAddressProvider()).toMatchAddress(fork.config.curve.addressProvider);
    expect(await curvePriceFeed.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);

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

    expect(calcUnderlyingValuesTx).toMatchInlineGasSnapshot(`95419`);
  });

  it('returns correct values (non 18-decimal invariant asset proxy)', async () => {
    const curvePriceFeed = fork.deployment.curvePriceFeed;

    // Curve pool: 3pool
    const curvePool = new ICurveLiquidityPool('0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7', provider);
    const curveLPToken = new StandardToken('0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490', provider);

    // USDC as invariant asset proxy
    const invariantProxyAsset = new StandardToken(fork.config.primitives.usdc, provider);

    expect(await invariantProxyAsset.decimals()).not.toEqBigNumber(18);

    await curvePriceFeed.addDerivatives([curveLPToken], [invariantProxyAsset]);

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

    expect(calcUnderlyingValuesTx).toMatchInlineGasSnapshot(`62649`);
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
    const curvePriceFeed = fork.deployment.curvePriceFeed;
    const valueInterpreter = fork.deployment.valueInterpreter;

    // Curve pool: 3pool
    const curveLPToken = new StandardToken('0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490', provider);
    const invariantProxyAsset = new StandardToken(fork.config.primitives.usdc, provider);

    expect(await invariantProxyAsset.decimals()).not.toEqBigNumber(18);

    // Add curveLPToken to price feed
    await curvePriceFeed.addDerivatives([curveLPToken], [invariantProxyAsset]);
    await valueInterpreter.addDerivatives([curveLPToken], [curvePriceFeed]);

    // Get value in terms of invariant proxy asset for easy comparison
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(curveLPToken, utils.parseEther('1'), invariantProxyAsset)
      .call();

    // Should be slightly more than 1 unit of USDC (10^6)
    expect(canonicalAssetValue).toEqBigNumber('1020540');
  });
});

describe('derivatives registry', () => {
  describe('addDerivatives', () => {
    it('does not allow an empty _derivatives array', async () => {
      await expect(fork.deployment.curvePriceFeed.addDerivatives([], [randomAddress()])).rejects.toBeRevertedWith(
        'Empty _derivatives',
      );
    });

    it('does not allow unequal _derivatives and _invariantProxyAssets arrays', async () => {
      await expect(fork.deployment.curvePriceFeed.addDerivatives([randomAddress()], [])).rejects.toBeRevertedWith(
        'Unequal arrays',
      );
    });

    it('does not allow an empty derivative', async () => {
      await expect(
        fork.deployment.curvePriceFeed.addDerivatives([constants.AddressZero], [randomAddress()]),
      ).rejects.toBeRevertedWith('Empty derivative');
    });

    it('does not allow an empty invariantProxyAsset', async () => {
      await expect(
        fork.deployment.curvePriceFeed.addDerivatives([randomAddress()], [constants.AddressZero]),
      ).rejects.toBeRevertedWith('Empty invariantProxyAsset');
    });

    it('does not allow an already-added derivative', async () => {
      await expect(
        fork.deployment.curvePriceFeed.addDerivatives([fork.config.curve.pools.steth.lpToken], [randomAddress()]),
      ).rejects.toBeRevertedWith('Value already set');
    });

    it('does not allow an invalid derivative', async () => {
      // Revert reason tough to reach as most assets will revert on Curve's end
      await expect(
        fork.deployment.curvePriceFeed.addDerivatives([fork.config.primitives.mln], [fork.config.weth]),
      ).rejects.toBeReverted();
    });

    it.todo('does not allow a derivative if the ValueInterpreter cannot produce a valid price for it');

    it('adds multiple derivatives (both LP and liquidity gauge) and emits an event for each', async () => {
      const curvePriceFeed = fork.deployment.curvePriceFeed;

      // Curve pool: bBTC
      const curvePool = '0x071c661B4DeefB59E2a3DdB20Db036821eeE8F4b';
      const curveLPToken = '0x410e3E86ef427e30B9235497143881f717d93c2A';
      const curveLiquidityGaugeToken = '0xdFc7AdFa664b08767b735dE28f9E84cd30492aeE';

      const newDerivatives = [curveLPToken, curveLiquidityGaugeToken];
      const invariantProxyAsset = new StandardToken(fork.config.weth, provider);
      const invariantProxyAssetDecimals = await invariantProxyAsset.decimals();

      // The derivatives should not be supported assets initially
      expect(await curvePriceFeed.isSupportedAsset(newDerivatives[0])).toBe(false);
      expect(await curvePriceFeed.isSupportedAsset(newDerivatives[1])).toBe(false);

      // Add the new derivatives
      const addDerivativesTx = await curvePriceFeed.addDerivatives(
        newDerivatives,
        new Array(newDerivatives.length).fill(invariantProxyAsset),
      );

      // The underlying tokens should be stored for each derivative
      const getDerivativeInfoFragment = curvePriceFeed.getDerivativeInfo.fragment;

      expect(await curvePriceFeed.getDerivativeInfo(newDerivatives[0])).toMatchFunctionOutput(
        getDerivativeInfoFragment,
        {
          invariantProxyAsset,
          invariantProxyAssetDecimals,
          pool: curvePool,
        },
      );
      expect(await curvePriceFeed.getDerivativeInfo(newDerivatives[1])).toMatchFunctionOutput(
        getDerivativeInfoFragment,
        {
          invariantProxyAsset,
          invariantProxyAssetDecimals,
          pool: curvePool,
        },
      );

      // The tokens should now be supported assets
      expect(await curvePriceFeed.isSupportedAsset(newDerivatives[0])).toBe(true);
      expect(await curvePriceFeed.isSupportedAsset(newDerivatives[1])).toBe(true);

      // The correct event should have been emitted for each derivative
      const events = extractEvent(addDerivativesTx, 'DerivativeAdded');

      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        derivative: newDerivatives[0],
        invariantProxyAsset,
        invariantProxyAssetDecimals,
        pool: curvePool,
      });

      expect(events[1]).toMatchEventArgs({
        derivative: newDerivatives[1],
        invariantProxyAsset,
        invariantProxyAssetDecimals,
        pool: curvePool,
      });
    });
  });

  describe('removeDerivatives', () => {
    it('does not allow an empty _derivatives array', async () => {
      await expect(fork.deployment.curvePriceFeed.removeDerivatives([])).rejects.toBeRevertedWith('Empty _derivatives');
    });

    it('does not allow an empty derivative', async () => {
      await expect(fork.deployment.curvePriceFeed.removeDerivatives([constants.AddressZero])).rejects.toBeRevertedWith(
        'Empty derivative',
      );
    });

    it('does not allow a non-added derivative', async () => {
      await expect(fork.deployment.curvePriceFeed.removeDerivatives([randomAddress()])).rejects.toBeRevertedWith(
        'Value is not set',
      );
    });

    it('removes multiple derivatives from registry and emits an event for each', async () => {
      const curvePriceFeed = fork.deployment.curvePriceFeed;
      const curveLPToken = new StandardToken(fork.config.curve.pools.steth.lpToken, provider);
      const curveLiquidityGaugeToken = new StandardToken(fork.config.curve.pools.steth.liquidityGaugeToken, provider);

      const derivativesToRemove = [curveLPToken, curveLiquidityGaugeToken];

      // The tokens should initially be supported assets
      expect(await curvePriceFeed.isSupportedAsset(derivativesToRemove[0])).toBe(true);
      expect(await curvePriceFeed.isSupportedAsset(derivativesToRemove[1])).toBe(true);

      // Remove the derivatives
      const removeDerivativesTx = await curvePriceFeed.removeDerivatives(derivativesToRemove);

      // The tokens should no longer be supported assets
      expect(await curvePriceFeed.isSupportedAsset(derivativesToRemove[0])).toBe(false);
      expect(await curvePriceFeed.isSupportedAsset(derivativesToRemove[1])).toBe(false);

      // The correct event should have been emitted for each derivative
      const events = extractEvent(removeDerivativesTx, 'DerivativeRemoved');

      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        derivative: derivativesToRemove[0],
      });

      expect(events[1]).toMatchEventArgs({
        derivative: derivativesToRemove[1],
      });
    });
  });
});
