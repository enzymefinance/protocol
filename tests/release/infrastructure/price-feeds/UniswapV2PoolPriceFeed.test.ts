import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import { IUniswapV2Pair, MockToken, MockUniswapV2PriceSource, StandardToken } from '@enzymefinance/protocol';
import { defaultTestDeployment } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  const usdc = deployment.tokens.usdc;
  const weth = deployment.tokens.weth;
  const mln = deployment.tokens.mln;

  // Denormalized amount of the initial pair seed
  const defaultSeedAmount = '100';

  // Create a pair formed by different decimal tokens (usdc/weth)
  const wethUsdcPair = await MockUniswapV2PriceSource.deploy(
    config.deployer,
    deployment.centralizedRateProvider,
    usdc,
    weth,
  );
  await deployment.uniswapV2PoolPriceFeed.addPoolTokens([wethUsdcPair]);
  await deployment.aggregatedDerivativePriceFeed.addDerivatives([wethUsdcPair], [deployment.uniswapV2PoolPriceFeed]);

  await usdc.transfer(wethUsdcPair, utils.parseUnits(defaultSeedAmount, 6));
  await weth.transfer(wethUsdcPair, utils.parseEther(defaultSeedAmount));

  // Create a pair formed by same decimal tokens (mln/weth)
  const mlnWethPair = await MockUniswapV2PriceSource.deploy(
    config.deployer,
    deployment.centralizedRateProvider,
    mln,
    weth,
  );
  await deployment.uniswapV2PoolPriceFeed.addPoolTokens([mlnWethPair]);
  await deployment.aggregatedDerivativePriceFeed.addDerivatives([mlnWethPair], [deployment.uniswapV2PoolPriceFeed]);

  await mln.transfer(mlnWethPair, utils.parseEther(defaultSeedAmount));
  await weth.transfer(mlnWethPair, utils.parseEther(defaultSeedAmount));

  return {
    accounts,
    deployment,
    mocks: { mlnWethPair, wethUsdcPair },
    defaultSeedAmount,
    config,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      config: {
        deployer,
        derivatives: { uniswapV2 },
        integratees: {
          uniswapV2: { factory },
        },
      },
      deployment: { aggregatedDerivativePriceFeed, chainlinkPriceFeed, uniswapV2PoolPriceFeed, valueInterpreter },
    } = await provider.snapshot(snapshot);

    expect(await uniswapV2PoolPriceFeed.getFactory()).toMatchAddress(factory);
    expect(await uniswapV2PoolPriceFeed.getDerivativePriceFeed()).toMatchAddress(aggregatedDerivativePriceFeed);
    expect(await uniswapV2PoolPriceFeed.getPrimitivePriceFeed()).toMatchAddress(chainlinkPriceFeed);
    expect(await uniswapV2PoolPriceFeed.getValueInterpreter()).toMatchAddress(valueInterpreter);

    for (const poolToken of Object.values(uniswapV2)) {
      const pairContract = new IUniswapV2Pair(poolToken, deployer);
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();
      expect(await uniswapV2PoolPriceFeed.getPoolTokenInfo(poolToken)).toMatchFunctionOutput(
        uniswapV2PoolPriceFeed.getPoolTokenInfo,
        {
          token0,
          token1,
          token0Decimals: await new StandardToken(token0, deployer).decimals(),
          token1Decimals: await new StandardToken(token1, deployer).decimals(),
        },
      );
    }
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for 18 decimals underlying assets', async () => {
    const {
      deployment: {
        uniswapV2PoolPriceFeed,
        tokens: { mln, weth },
      },
      mocks: { mlnWethPair },
      defaultSeedAmount,
    } = await provider.snapshot(snapshot);
    const uniswapWethUsdtPairToken = new StandardToken(mlnWethPair, provider);
    const totalSupply = await uniswapWethUsdtPairToken.totalSupply();
    const calcUnderlyingValues = await uniswapV2PoolPriceFeed.calcUnderlyingValues
      .args(mlnWethPair, utils.parseUnits('1', await mlnWethPair.decimals()))
      .call();
    const ratePrecision = BigNumber.from(10).pow(18);

    const wethAmount = utils.parseEther(defaultSeedAmount);
    const mlnAmount = utils.parseEther(defaultSeedAmount);

    expect(calcUnderlyingValues).toMatchFunctionOutput(uniswapV2PoolPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [
        wethAmount.mul(ratePrecision).div(totalSupply),
        mlnAmount.mul(ratePrecision).div(totalSupply),
      ],
      underlyings_: [mln, weth],
    });
  });

  it('returns rate for non-18 decimals underlying assets', async () => {
    const {
      deployment: {
        uniswapV2PoolPriceFeed,
        tokens: { weth, usdc },
      },
      mocks: { wethUsdcPair },
      defaultSeedAmount,
    } = await provider.snapshot(snapshot);

    const uniswapWethUsdcPairToken = new StandardToken(wethUsdcPair, provider);
    const totalSupply = await uniswapWethUsdcPairToken.totalSupply();

    const calcUnderlyingValues = await uniswapV2PoolPriceFeed.calcUnderlyingValues
      .args(wethUsdcPair, utils.parseUnits('1', await uniswapWethUsdcPairToken.decimals()))
      .call();
    const ratePrecision = utils.parseUnits('1', 18);

    const usdcAmount = utils.parseUnits(defaultSeedAmount, 6);
    const wethAmount = utils.parseEther(defaultSeedAmount);

    expect(calcUnderlyingValues).toMatchFunctionOutput(uniswapV2PoolPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [
        usdcAmount.mul(ratePrecision).div(totalSupply),
        wethAmount.mul(ratePrecision).div(totalSupply),
      ],
      underlyings_: [usdc, weth],
    });
  });
});

describe('addPoolTokens', () => {
  it('does not allow a random caller', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { uniswapV2PoolPriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(uniswapV2PoolPriceFeed.connect(randomUser).addPoolTokens([randomAddress()])).rejects.toBeRevertedWith(
      'Only the Dispatcher owner can call this function',
    );
  });

  it('does not allow an empty _poolTokens param', async () => {
    const {
      deployment: { uniswapV2PoolPriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(uniswapV2PoolPriceFeed.addPoolTokens([])).rejects.toBeRevertedWith('Empty _poolTokens');
  });

  it('does not allow an already-set poolToken', async () => {
    const {
      deployment: {
        uniswapV2PoolPriceFeed,
        uniswapV2Derivatives: { kncWeth },
      },
    } = await provider.snapshot(snapshot);

    await expect(uniswapV2PoolPriceFeed.addPoolTokens([kncWeth])).rejects.toBeRevertedWith('Value already set');
  });

  it('does not allow unsupportable pool tokens', async () => {
    const {
      config: { deployer },
      deployment: {
        centralizedRateProvider,
        compoundTokens: { cdai, ccomp },
        uniswapV2PoolPriceFeed,
        tokens: { weth },
      },
    } = await provider.snapshot(snapshot);

    const unsupportedToken = await MockToken.deploy(deployer, 'Unsupported Token', 'UN', 18);
    const revertReason = 'Unsupported pool token';

    const derivative0Derivative1Pair = await MockUniswapV2PriceSource.deploy(
      deployer,
      centralizedRateProvider,
      cdai,
      ccomp,
    );
    await expect(uniswapV2PoolPriceFeed.addPoolTokens([derivative0Derivative1Pair])).rejects.toBeRevertedWith(
      revertReason,
    );

    const primitive0Unsupported1Pair = await MockUniswapV2PriceSource.deploy(
      deployer,
      centralizedRateProvider,
      weth,
      unsupportedToken,
    );
    await expect(uniswapV2PoolPriceFeed.addPoolTokens([primitive0Unsupported1Pair])).rejects.toBeRevertedWith(
      revertReason,
    );

    const Unsupported0Primitive1Pair = await MockUniswapV2PriceSource.deploy(
      deployer,
      centralizedRateProvider,
      unsupportedToken,
      weth,
    );
    await expect(uniswapV2PoolPriceFeed.addPoolTokens([Unsupported0Primitive1Pair])).rejects.toBeRevertedWith(
      revertReason,
    );
  });

  it('adds pool tokens and emits an event per added pool token', async () => {
    const {
      config: { deployer },
      deployment: {
        centralizedRateProvider,
        compoundTokens: { cdai },
        uniswapV2PoolPriceFeed,
        tokens: { weth, mln },
      },
    } = await provider.snapshot(snapshot);

    // Create valid pool tokens (all possible valid types)
    const primitive0Primitive1Pair = await MockUniswapV2PriceSource.deploy(
      deployer,
      centralizedRateProvider,
      weth,
      mln,
    );
    const primitive0Derivative1Pair = await MockUniswapV2PriceSource.deploy(
      deployer,
      centralizedRateProvider,
      weth,
      cdai,
    );
    const derivative0Primitive1Pair = await MockUniswapV2PriceSource.deploy(
      deployer,
      centralizedRateProvider,
      cdai,
      weth,
    );

    // The pool tokens should not be supported assets initially
    expect(await uniswapV2PoolPriceFeed.isSupportedAsset(primitive0Primitive1Pair)).toBe(false);
    expect(await uniswapV2PoolPriceFeed.isSupportedAsset(primitive0Derivative1Pair)).toBe(false);
    expect(await uniswapV2PoolPriceFeed.isSupportedAsset(derivative0Primitive1Pair)).toBe(false);

    // Add the new pool tokens
    const addPoolTokensTx = await uniswapV2PoolPriceFeed.addPoolTokens([
      primitive0Primitive1Pair,
      primitive0Derivative1Pair,
      derivative0Primitive1Pair,
    ]);

    // Token info should be stored for each pool token (also validates getPoolTokenUnderlyings)
    expect(await uniswapV2PoolPriceFeed.getPoolTokenInfo(primitive0Primitive1Pair)).toMatchFunctionOutput(
      uniswapV2PoolPriceFeed.getPoolTokenInfo,
      {
        token0: weth,
        token1: mln,
        token0Decimals: await weth.decimals(),
        token1Decimals: await mln.decimals(),
      },
    );
    expect(await uniswapV2PoolPriceFeed.getPoolTokenUnderlyings(primitive0Primitive1Pair)).toMatchFunctionOutput(
      uniswapV2PoolPriceFeed.getPoolTokenUnderlyings,
      {
        token0_: weth,
        token1_: mln,
      },
    );
    expect(await uniswapV2PoolPriceFeed.getPoolTokenInfo(primitive0Derivative1Pair)).toMatchFunctionOutput(
      uniswapV2PoolPriceFeed.getPoolTokenInfo,
      {
        token0: weth,
        token1: cdai,
        token0Decimals: await weth.decimals(),
        token1Decimals: await cdai.decimals(),
      },
    );
    expect(await uniswapV2PoolPriceFeed.getPoolTokenUnderlyings(primitive0Derivative1Pair)).toMatchFunctionOutput(
      uniswapV2PoolPriceFeed.getPoolTokenUnderlyings,
      {
        token0_: weth,
        token1_: cdai,
      },
    );
    expect(await uniswapV2PoolPriceFeed.getPoolTokenInfo(derivative0Primitive1Pair)).toMatchFunctionOutput(
      uniswapV2PoolPriceFeed.getPoolTokenInfo,
      {
        token0: cdai,
        token1: weth,
        token0Decimals: await cdai.decimals(),
        token1Decimals: await weth.decimals(),
      },
    );
    expect(await uniswapV2PoolPriceFeed.getPoolTokenUnderlyings(derivative0Primitive1Pair)).toMatchFunctionOutput(
      uniswapV2PoolPriceFeed.getPoolTokenUnderlyings,
      {
        token0_: cdai,
        token1_: weth,
      },
    );

    // The tokens should now be supported assets
    expect(await uniswapV2PoolPriceFeed.isSupportedAsset(primitive0Primitive1Pair)).toBe(true);
    expect(await uniswapV2PoolPriceFeed.isSupportedAsset(primitive0Derivative1Pair)).toBe(true);
    expect(await uniswapV2PoolPriceFeed.isSupportedAsset(derivative0Primitive1Pair)).toBe(true);

    // The correct event should have been emitted for each pool token
    const events = extractEvent(addPoolTokensTx, 'PoolTokenAdded');
    expect(events.length).toBe(3);
    expect(events[0]).toMatchEventArgs({
      poolToken: primitive0Primitive1Pair,
      token0: weth,
      token1: mln,
    });
    expect(events[1]).toMatchEventArgs({
      poolToken: primitive0Derivative1Pair,
      token0: weth,
      token1: cdai,
    });
    expect(events[2]).toMatchEventArgs({
      poolToken: derivative0Primitive1Pair,
      token0: cdai,
      token1: weth,
    });
  });
});
