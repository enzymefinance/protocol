import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { ICurveLiquidityPool, StandardToken } from '@enzymefinance/protocol';
import { ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const curvePriceFeed = fork.deployment.CurvePriceFeed;

    expect(await curvePriceFeed.getAddressProvider()).toMatchAddress(fork.config.curve.addressProvider);
    expect(await curvePriceFeed.getDispatcher()).toMatchAddress(fork.deployment.Dispatcher);
  });
});

describe('calcUnderlyingValues', () => {
  it('does not allow an unsupported derivative', async () => {
    await expect(fork.deployment.CurvePriceFeed.calcUnderlyingValues(randomAddress(), 1)).rejects.toBeRevertedWith(
      '_derivative is not supported',
    );
  });

  it('returns correct values (18-decimal invariant asset proxy)', async () => {
    const curvePriceFeed = fork.deployment.CurvePriceFeed;
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
    // Rounding up from 61325
    expect(calcUnderlyingValuesTx).toCostLessThan('62000');
  });

  it('returns correct values (non 18-decimal invariant asset proxy)', async () => {
    const curvePriceFeed = fork.deployment.CurvePriceFeed;

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
      .div(utils.parseEther('1').mul(2));

    const calcUnderlyingValuesRes = await curvePriceFeed.calcUnderlyingValues.args(curveLPToken, lpTokenUnit).call();
    expect(calcUnderlyingValuesRes.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(calcUnderlyingValuesRes.underlyings_[0]).toMatchAddress(invariantProxyAsset);

    const calcUnderlyingValuesTx = await curvePriceFeed.calcUnderlyingValues(curveLPToken, lpTokenUnit);
    // Rounding up from 48432
    expect(calcUnderlyingValuesTx).toCostLessThan('49000');
  });
});

describe('expected values', () => {
  it.todo('returns the expected value from the valueInterpreter (18-decimal invariant asset proxy)');

  it.todo('returns the expected value from the valueInterpreter (non 18-decimal invariant asset proxy)');
});

describe('derivatives registry', () => {
  describe('addDerivatives', () => {
    it('does not allow an empty _derivatives array', async () => {
      await expect(fork.deployment.CurvePriceFeed.addDerivatives([], [randomAddress()])).rejects.toBeRevertedWith(
        'Empty _derivatives',
      );
    });

    it('does not allow unequal _derivatives and _invariantProxyAssets arrays', async () => {
      await expect(fork.deployment.CurvePriceFeed.addDerivatives([randomAddress()], [])).rejects.toBeRevertedWith(
        'Unequal arrays',
      );
    });

    it('does not allow an empty derivative', async () => {
      await expect(
        fork.deployment.CurvePriceFeed.addDerivatives([constants.AddressZero], [randomAddress()]),
      ).rejects.toBeRevertedWith('Empty derivative');
    });

    it('does not allow an empty invariantProxyAsset', async () => {
      await expect(
        fork.deployment.CurvePriceFeed.addDerivatives([randomAddress()], [constants.AddressZero]),
      ).rejects.toBeRevertedWith('Empty invariantProxyAsset');
    });

    it('does not allow an already-added derivative', async () => {
      await expect(
        fork.deployment.CurvePriceFeed.addDerivatives([fork.config.curve.pools.steth.lpToken], [randomAddress()]),
      ).rejects.toBeRevertedWith('Value already set');
    });

    it('does not allow an invalid derivative', async () => {
      // Revert reason tough to reach as most assets will revert on Curve's end
      await expect(
        fork.deployment.CurvePriceFeed.addDerivatives([fork.config.primitives.mln], [fork.config.weth]),
      ).rejects.toBeReverted();
    });

    it.todo('does not allow a derivative if the ValueInterpreter cannot produce a valid price for it');

    it('adds multiple derivatives (both LP and liquidity gauge) and emits an event for each', async () => {
      const curvePriceFeed = fork.deployment.CurvePriceFeed;

      // Curve pool: Aave
      const curvePool = '0xDeBF20617708857ebe4F679508E7b7863a8A8EeE';
      const curveLPToken = '0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900';
      const curveLiquidityGaugeToken = '0xd662908ADA2Ea1916B3318327A97eB18aD588b5d';

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
          pool: curvePool,
          invariantProxyAsset,
          invariantProxyAssetDecimals,
        },
      );
      expect(await curvePriceFeed.getDerivativeInfo(newDerivatives[1])).toMatchFunctionOutput(
        getDerivativeInfoFragment,
        {
          pool: curvePool,
          invariantProxyAsset,
          invariantProxyAssetDecimals,
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
        pool: curvePool,
        invariantProxyAsset,
        invariantProxyAssetDecimals,
      });

      expect(events[1]).toMatchEventArgs({
        derivative: newDerivatives[1],
        pool: curvePool,
        invariantProxyAsset,
        invariantProxyAssetDecimals,
      });
    });
  });

  describe('removeDerivatives', () => {
    it('does not allow an empty _derivatives array', async () => {
      await expect(fork.deployment.CurvePriceFeed.removeDerivatives([])).rejects.toBeRevertedWith('Empty _derivatives');
    });

    it('does not allow an empty derivative', async () => {
      await expect(fork.deployment.CurvePriceFeed.removeDerivatives([constants.AddressZero])).rejects.toBeRevertedWith(
        'Empty derivative',
      );
    });

    it('does not allow a non-added derivative', async () => {
      await expect(fork.deployment.CurvePriceFeed.removeDerivatives([randomAddress()])).rejects.toBeRevertedWith(
        'Value is not set',
      );
    });

    it('removes multiple derivatives from registry and emits an event for each', async () => {
      const curvePriceFeed = fork.deployment.CurvePriceFeed;
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
