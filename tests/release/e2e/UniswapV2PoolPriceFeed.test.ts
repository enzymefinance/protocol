import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { IUniswapV2Pair, StandardToken } from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  buyShares,
  createNewFund,
  defaultForkDeployment,
  uniswapV2Lend,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const gasAssertionTolerance = 0.03; // 3%

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe('derivative gas costs', () => {
  it('adds to calcGav for weth-denominated fund', async () => {
    const {
      accounts: [fundOwner],
      config: {
        deployer,
        tokens: { mln, weth },
      },
      deployment: { integrationManager, fundDeployer, trackedAssetsAdapter, uniswapV2Adapter },
    } = await provider.snapshot(snapshot);

    const denominationAsset = weth;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
    });

    const initialTokenAmount = utils.parseEther('1');

    // Buy shares to add denomination asset
    await buyShares({
      comptrollerProxy,
      signer: deployer,
      buyers: [deployer],
      denominationAsset,
      investmentAmounts: [initialTokenAmount],
    });

    // Add mln to be able to buy pool tokens
    await addNewAssetsToFund({
      fundOwner,
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      trackedAssetsAdapter,
      assets: [mln],
      amounts: [initialTokenAmount],
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav(true)).gasUsed;

    // Use max of half the asset balances to get MLN-WETH pool tokens
    await uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      tokenA: weth,
      tokenB: mln,
      amountADesired: initialTokenAmount.div(2),
      amountBDesired: initialTokenAmount.div(2),
      amountAMin: 1,
      amountBMin: 1,
      minPoolTokenAmount: 1,
    });

    // Get the calcGav() cost including the pool token
    const calcGavWithToken = await comptrollerProxy.calcGav(true);

    // Assert gas
    expect(calcGavWithToken).toCostLessThan(calcGavBaseGas.add(92000), gasAssertionTolerance);
  });
});

describe('calcUnderlyingValues', () => {
  it('returns the correct rate for two 18-decimal primitive tokens', async () => {
    const {
      config: {
        deployer,
        derivatives: {
          uniswapV2: { mlnWeth },
        },
      },
      deployment: { uniswapV2PoolPriceFeed, valueInterpreter },
    } = await provider.snapshot(snapshot);

    const pair = new IUniswapV2Pair(mlnWeth, deployer);
    const token0Address = await pair.token0();
    const token0RatioAmount = utils.parseEther('1');
    const token1Address = await pair.token1();

    const poolTokenUnit = utils.parseEther('1');

    const calcUnderlyingValuesRes = await uniswapV2PoolPriceFeed.calcUnderlyingValues
      .args(mlnWeth, poolTokenUnit)
      .call();
    expect(calcUnderlyingValuesRes).toMatchFunctionOutput(uniswapV2PoolPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [expect.any(String), expect.any(String)],
      underlyings_: [token0Address, token1Address],
    });

    // Confirms arb has moved the price in the correct direction

    // Get the rate ratio of the Uniswap pool
    const getReservesRes = await pair.getReserves();
    const poolRateRatio = getReservesRes[0].mul(utils.parseEther('1')).div(getReservesRes[1]);

    // Get the trusted rate ratio based on trusted prices
    const calcCanonicalAssetValueRes = await valueInterpreter.calcCanonicalAssetValue
      .args(token0Address, token0RatioAmount, token1Address)
      .call();
    const trustedUnderlyingsRateRatio = token0RatioAmount
      .mul(utils.parseEther('1'))
      .div(calcCanonicalAssetValueRes.value_);

    // Get the final calculated canonical rate
    const canonicalUnderlyingsRateRatio = calcUnderlyingValuesRes.underlyingAmounts_[0]
      .mul(utils.parseEther('1'))
      .div(calcUnderlyingValuesRes.underlyingAmounts_[1]);

    // Final canonical rate should be pushed towards the trusted rate ratio
    if (poolRateRatio > trustedUnderlyingsRateRatio) {
      expect(canonicalUnderlyingsRateRatio).toBeLtBigNumber(poolRateRatio);
      expect(canonicalUnderlyingsRateRatio).toBeGtBigNumber(trustedUnderlyingsRateRatio);
    } else if (poolRateRatio < trustedUnderlyingsRateRatio) {
      expect(canonicalUnderlyingsRateRatio).toBeGtBigNumber(poolRateRatio);
      expect(canonicalUnderlyingsRateRatio).toBeLtBigNumber(trustedUnderlyingsRateRatio);
    } else {
      expect(canonicalUnderlyingsRateRatio).toEqBigNumber(poolRateRatio);
    }
  });

  describe('expected values', () => {
    it('returns the expected value from the valueInterpreter (different decimals pool)', async () => {
      const {
        config: {
          deployer,
          tokens: { usdc },
          derivatives: {
            uniswapV2: { usdcWeth: usdcWethAddress },
          },
        },
        deployment: { valueInterpreter },
      } = await provider.snapshot(snapshot);

      const usdcWeth = new StandardToken(usdcWethAddress, deployer);
      const baseDecimals = await usdcWeth.decimals();
      const quoteDecimals = await usdc.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(6);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(usdcWeth, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      // usdc/weth on Jan 9, 2021 was worth about $93M
      // Source: <https://app.zerion.io/market/asset/UNI-V2-0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc>
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: 93375626338592,
        isValid_: true,
      });
    });

    it('returns the expected value from the valueInterpreter (18 decimals pool)', async () => {
      const {
        config: {
          deployer,
          tokens: { dai },
          derivatives: {
            uniswapV2: { kncWeth: kncWethAddress },
          },
        },
        deployment: { valueInterpreter },
      } = await provider.snapshot(snapshot);

      const kncWeth = new StandardToken(kncWethAddress, deployer);
      const baseDecimals = await kncWeth.decimals();
      const quoteDecimals = await dai.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(18);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(kncWeth, utils.parseUnits('1', baseDecimals), dai)
        .call();

      // knc/weth on Jan 9, 2021 was worth about $90
      // Source: <https://app.zerion.io/market/asset/UNI-V2-0xf49c43ae0faf37217bdcb00df478cf793edd6687>
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('89819288695926648730'),
        isValid_: true,
      });
    });

    it.todo('returns the correct rate for a non-18 decimal primitive and a derivative');
    it.todo('[adjust the above tests to assert exact rate calcs]');
  });
});
