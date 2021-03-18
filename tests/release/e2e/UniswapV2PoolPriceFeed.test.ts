import { IUniswapV2Pair, StandardToken } from '@enzymefinance/protocol';
import {
  buyShares,
  createNewFund,
  ProtocolDeployment,
  deployProtocolFixture,
  uniswapV2Lend,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('derivative gas costs', () => {
  it('adds to calcGav for weth-denominated fund', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const mln = new StandardToken(fork.config.primitives.mln, whales.mln);
    const denominationAsset = weth;
    const [fundOwner, investor] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const initialTokenAmount = utils.parseEther('1');

    // Seed fund and buy shares to add denomination asset
    await weth.transfer(investor, initialTokenAmount);
    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [initialTokenAmount],
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav(true)).gasUsed;

    // Seed fund with 2nd asset and use max of half the asset balances to get MLN-WETH pool tokens
    await mln.transfer(vaultProxy, initialTokenAmount);
    await uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      uniswapV2Adapter: fork.deployment.uniswapV2Adapter,
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
    expect(calcGavWithToken).toCostLessThan(calcGavBaseGas.add(92000));
  });
});

describe('calcUnderlyingValues', () => {
  it('returns the correct rate for two 18-decimal primitive tokens', async () => {
    const uniswapV2PoolPriceFeed = fork.deployment.uniswapV2PoolPriceFeed;
    const valueInterpreter = fork.deployment.valueInterpreter;
    const uniswapPair = new IUniswapV2Pair(fork.config.uniswap.pools.mlnWeth, provider);

    const token0Address = await uniswapPair.token0();
    const token0RatioAmount = utils.parseEther('1');
    const token1Address = await uniswapPair.token1();

    const poolTokenUnit = utils.parseEther('1');

    const calcUnderlyingValuesRes = await uniswapV2PoolPriceFeed.calcUnderlyingValues
      .args(uniswapPair, poolTokenUnit)
      .call();
    expect(calcUnderlyingValuesRes).toMatchFunctionOutput(uniswapV2PoolPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [expect.any(String), expect.any(String)],
      underlyings_: [token0Address, token1Address],
    });

    // Confirms arb has moved the price in the correct direction

    // Get the rate ratio of the Uniswap pool
    const getReservesRes = await uniswapPair.getReserves();
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
      const valueInterpreter = fork.deployment.valueInterpreter;
      const usdc = new StandardToken(fork.config.primitives.usdc, provider);
      const usdcWeth = new StandardToken(fork.config.uniswap.pools.usdcWeth, provider);

      const baseDecimals = await usdcWeth.decimals();
      const quoteDecimals = await usdc.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(6);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(usdcWeth, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      // usdc/weth on Jan 17, 2021 was worth about $93M
      // Source: <https://app.zerion.io/market/asset/UNI-V2-0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc>
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        isValid_: true,
        value_: 92446608602898,
      });
    });

    it('returns the expected value from the valueInterpreter (18 decimals pool)', async () => {
      const valueInterpreter = fork.deployment.valueInterpreter;
      const dai = new StandardToken(fork.config.primitives.dai, provider);
      const kncWeth = new StandardToken(fork.config.uniswap.pools.kncWeth, provider);

      const baseDecimals = await kncWeth.decimals();
      const quoteDecimals = await dai.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(18);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(kncWeth, utils.parseUnits('1', baseDecimals), dai)
        .call();

      // knc/weth on Jan 17, 2021 was worth about $90
      // Source: <https://app.zerion.io/market/asset/UNI-V2-0xf49c43ae0faf37217bdcb00df478cf793edd6687>
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('88913536813954309095'),
        isValid_: true,
      });
    });

    it.todo('returns the correct rate for a non-18 decimal primitive and a derivative');
    it.todo('[adjust the above tests to assert exact rate calcs]');
  });
});
