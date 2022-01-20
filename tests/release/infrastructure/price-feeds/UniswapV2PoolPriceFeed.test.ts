import type { AddressLike } from '@enzymefinance/ethers';
import { IUniswapV2Pair, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { buyShares, createNewFund, deployProtocolFixture, uniswapV2Lend } from '@enzymefinance/testutils';
import { utils } from 'ethers';

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
      denominationAsset: weth,
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

    // Seed fund with 2nd asset and use max of half the asset balances to get MLN-WETH pool tokens
    await mln.transfer(vaultProxy, initialTokenAmount);
    await uniswapV2Lend({
      amountADesired: initialTokenAmount.div(2),
      amountAMin: 1,
      amountBDesired: initialTokenAmount.div(2),
      amountBMin: 1,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minPoolTokenAmount: 1,
      tokenA: weth,
      tokenB: mln,
      uniswapV2LiquidityAdapter: fork.deployment.uniswapV2LiquidityAdapter,
      vaultProxy,
    });

    // Get the calcGav() cost including the pool token
    const calcGavWithToken = await comptrollerProxy.calcGav();

    // Assert gas
    expect(calcGavWithToken).toCostAround(calcGavBaseGas.add(87895));
  });
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const uniswapV2PoolPriceFeed = fork.deployment.uniswapV2PoolPriceFeed;

    expect(await uniswapV2PoolPriceFeed.getFactory()).toMatchAddress(fork.config.uniswap.factory);
    expect(await uniswapV2PoolPriceFeed.getValueInterpreter()).toMatchAddress(fork.deployment.valueInterpreter);

    for (const poolToken of Object.values(fork.config.uniswap.pools) as AddressLike[]) {
      const pairContract = new IUniswapV2Pair(poolToken, provider);
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();
      expect(await uniswapV2PoolPriceFeed.getPoolTokenInfo(poolToken)).toMatchFunctionOutput(
        uniswapV2PoolPriceFeed.getPoolTokenInfo,
        {
          token0,
          token0Decimals: await new StandardToken(token0, provider).decimals(),
          token1,
          token1Decimals: await new StandardToken(token1, provider).decimals(),
        },
      );
    }

    // FundDeployerOwnerMixin
    expect(await uniswapV2PoolPriceFeed.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for non-18 decimals underlying assets', async () => {
    const uniswapV2PoolPriceFeed = fork.deployment.uniswapV2PoolPriceFeed;

    const poolToken = new IUniswapV2Pair(fork.config.uniswap.pools.usdcWeth, provider);
    const token0Address = await poolToken.token0();
    const token1Address = await poolToken.token1();

    const calcUnderlyingValues = await uniswapV2PoolPriceFeed.calcUnderlyingValues
      .args(poolToken, utils.parseEther('1'))
      .call();

    expect(calcUnderlyingValues).toMatchFunctionOutput(uniswapV2PoolPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: ['112827537111558', '29484552363560411525430'],
      underlyings_: [token0Address, token1Address],
    });
  });

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
    const token1RatioAmount = await valueInterpreter.calcCanonicalAssetValue
      .args(token0Address, token0RatioAmount, token1Address)
      .call();
    const trustedUnderlyingsRateRatio = token0RatioAmount.mul(utils.parseEther('1')).div(token1RatioAmount);

    // Get the final calculated canonical rate
    const canonicalUnderlyingsRateRatio = calcUnderlyingValuesRes.underlyingAmounts_[0]
      .mul(utils.parseEther('1'))
      .div(calcUnderlyingValuesRes.underlyingAmounts_[1]);

    // Final canonical rate should be pushed towards the trusted rate ratio
    if (poolRateRatio > trustedUnderlyingsRateRatio) {
      expect(canonicalUnderlyingsRateRatio).toBeLteBigNumber(poolRateRatio);
      expect(canonicalUnderlyingsRateRatio).toBeGteBigNumber(trustedUnderlyingsRateRatio);
    } else if (poolRateRatio < trustedUnderlyingsRateRatio) {
      expect(canonicalUnderlyingsRateRatio).toBeGteBigNumber(poolRateRatio);
      expect(canonicalUnderlyingsRateRatio).toBeLteBigNumber(trustedUnderlyingsRateRatio);
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

      // usdc/weth on Dec 17, 2021 was worth about $225M
      // Source: <https://app.zerion.io/market/asset/UNI-V2-0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc>
      expect(canonicalAssetValue).toEqBigNumber('225590617934947');
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

      // knc/weth on Dec 17, 2021 was worth about $200
      // Source: <https://app.zerion.io/market/asset/UNI-V2-0xf49c43ae0faf37217bdcb00df478cf793edd6687>
      expect(canonicalAssetValue).toEqBigNumber('198885677585140184405');
    });

    it.todo('returns the correct rate for a non-18 decimal primitive and a derivative');
    it.todo('[adjust the above tests to assert exact rate calcs]');
  });
});
