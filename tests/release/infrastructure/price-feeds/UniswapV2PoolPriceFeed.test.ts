import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { IUniswapV2Pair, StandardToken } from '@enzymefinance/protocol';
import { deployProtocolFixture, UniswapV2Factory } from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot() {
  const { accounts, deployer, deployment, config } = await deployProtocolFixture();

  return {
    accounts,
    deployer,
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      config: {
        uniswap: { factory, pools },
      },
      deployment: { aggregatedDerivativePriceFeed, chainlinkPriceFeed, uniswapV2PoolPriceFeed, valueInterpreter },
    } = await provider.snapshot(snapshot);

    expect(await uniswapV2PoolPriceFeed.getFactory()).toMatchAddress(factory);
    expect(await uniswapV2PoolPriceFeed.getDerivativePriceFeed()).toMatchAddress(aggregatedDerivativePriceFeed);
    expect(await uniswapV2PoolPriceFeed.getPrimitivePriceFeed()).toMatchAddress(chainlinkPriceFeed);
    expect(await uniswapV2PoolPriceFeed.getValueInterpreter()).toMatchAddress(valueInterpreter);

    for (const poolToken of Object.values(pools)) {
      const pairContract = new IUniswapV2Pair(poolToken, provider);
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();
      expect(await uniswapV2PoolPriceFeed.getPoolTokenInfo(poolToken)).toMatchFunctionOutput(
        uniswapV2PoolPriceFeed.getPoolTokenInfo,
        {
          token0,
          token1,
          token0Decimals: await new StandardToken(token0, provider).decimals(),
          token1Decimals: await new StandardToken(token1, provider).decimals(),
        },
      );
    }
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for 18 decimals underlying assets', async () => {
    const {
      config: {
        uniswap: {
          pools: { wethMln },
        },
      },
      deployment: { uniswapV2PoolPriceFeed },
    } = await provider.snapshot(snapshot);
    const poolToken = new IUniswapV2Pair(wethMln, provider);
    const token0Address = await poolToken.token0();
    const token1Address = await poolToken.token1();

    const calcUnderlyingValues = await uniswapV2PoolPriceFeed.calcUnderlyingValues
      .args(poolToken, utils.parseEther('1'))
      .call();

    expect(calcUnderlyingValues).toMatchFunctionOutput(uniswapV2PoolPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: ['284439872095526882', '9132207666138661852'],
      underlyings_: [token0Address, token1Address],
    });
  });

  it('returns rate for non-18 decimals underlying assets', async () => {
    const {
      config: {
        uniswap: {
          pools: { usdcWeth },
        },
      },
      deployment: { uniswapV2PoolPriceFeed },
    } = await provider.snapshot(snapshot);

    const poolToken = new IUniswapV2Pair(usdcWeth, provider);
    const token0Address = await poolToken.token0();
    const token1Address = await poolToken.token1();

    const calcUnderlyingValues = await uniswapV2PoolPriceFeed.calcUnderlyingValues
      .args(poolToken, utils.parseEther('1'))
      .call();

    expect(calcUnderlyingValues).toMatchFunctionOutput(uniswapV2PoolPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: ['79567669895365', '33866575594579201734267'],
      underlyings_: [token0Address, token1Address],
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
      'Only the FundDeployer owner can call this function',
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
      config: {
        uniswap: {
          pools: { wethKnc },
        },
      },
      deployment: { uniswapV2PoolPriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(uniswapV2PoolPriceFeed.addPoolTokens([wethKnc])).rejects.toBeRevertedWith('Value already set');
  });

  it('does not allow unsupportable pool tokens', async () => {
    const {
      deployer,
      config,
      deployment: { uniswapV2PoolPriceFeed },
    } = await provider.snapshot(snapshot);

    const revertReason = 'Unsupported pool token';
    const ceth = new StandardToken(config.compound.ceth, provider);
    const cdai = new StandardToken(config.compound.ctokens.cdai, provider);
    const uniswapV2Factory = new UniswapV2Factory(config.uniswap.factory, deployer);

    // cdai-ceth
    await uniswapV2Factory.createPair(cdai, ceth);
    const derivative0Derivative1Pair = await uniswapV2Factory.getPair(cdai, ceth);
    await expect(uniswapV2PoolPriceFeed.addPoolTokens([derivative0Derivative1Pair])).rejects.toBeRevertedWith(
      revertReason,
    );

    // usdt-hez pair
    const primitive0Unsupported1Pair = '0xf6c4e4f339912541d3f8ed99dba64a1372af5e5b'; // USDT-HEZ pair
    await expect(uniswapV2PoolPriceFeed.addPoolTokens([primitive0Unsupported1Pair])).rejects.toBeRevertedWith(
      revertReason,
    );

    // ousd-usdt pair
    const Unsupported0Primitive1Pair = '0xcc01d9d54d06b6a0b6d09a9f79c3a6438e505f71';
    await expect(uniswapV2PoolPriceFeed.addPoolTokens([Unsupported0Primitive1Pair])).rejects.toBeRevertedWith(
      revertReason,
    );
  });

  it('adds pool tokens and emits an event per added pool token', async () => {
    const {
      deployer,
      config,
      deployment: { uniswapV2PoolPriceFeed },
    } = await provider.snapshot(snapshot);

    const bat = new StandardToken(config.primitives.bat, provider);
    const mln = new StandardToken(config.primitives.mln, provider);
    const weth = new StandardToken(config.weth, provider);
    const cdai = new StandardToken(config.compound.ctokens.cdai, provider);

    // Create valid pool tokens (all possible valid types)

    const uniswapV2Factory = new UniswapV2Factory(config.uniswap.factory, deployer);

    // bat-mln
    await uniswapV2Factory.createPair(bat, mln);
    const batMln = await uniswapV2Factory.getPair(bat, mln);
    const batMlnPair = new IUniswapV2Pair(batMln, provider);

    await expect(batMlnPair.token0()).resolves.toMatchAddress(bat);
    await expect(batMlnPair.token1()).resolves.toMatchAddress(mln);

    // bat-cdai
    await uniswapV2Factory.createPair(bat, cdai);
    const batCdai = await uniswapV2Factory.getPair(bat, cdai);
    const batCdaiPair = new IUniswapV2Pair(batCdai, provider);

    await expect(batCdaiPair.token0()).resolves.toMatchAddress(bat);
    await expect(batCdaiPair.token1()).resolves.toMatchAddress(cdai);

    // cdai-weth
    const cdaiWeth = await uniswapV2Factory.getPair(cdai, weth);
    const cdaiWethPair = new IUniswapV2Pair(cdaiWeth, provider);

    await expect(cdaiWethPair.token0()).resolves.toMatchAddress(cdai);
    await expect(cdaiWethPair.token1()).resolves.toMatchAddress(weth);

    const primitive0Primitive1Pair = batMln;
    const primitive0Derivative1Pair = batCdai;
    const derivative0Primitive1Pair = cdaiWeth;

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
        token0: bat,
        token1: mln,
        token0Decimals: await bat.decimals(),
        token1Decimals: await mln.decimals(),
      },
    );
    expect(await uniswapV2PoolPriceFeed.getPoolTokenUnderlyings(primitive0Primitive1Pair)).toMatchFunctionOutput(
      uniswapV2PoolPriceFeed.getPoolTokenUnderlyings,
      {
        token0_: bat,
        token1_: mln,
      },
    );
    expect(await uniswapV2PoolPriceFeed.getPoolTokenInfo(primitive0Derivative1Pair)).toMatchFunctionOutput(
      uniswapV2PoolPriceFeed.getPoolTokenInfo,
      {
        token0: bat,
        token1: cdai,
        token0Decimals: await bat.decimals(),
        token1Decimals: await cdai.decimals(),
      },
    );
    expect(await uniswapV2PoolPriceFeed.getPoolTokenUnderlyings(primitive0Derivative1Pair)).toMatchFunctionOutput(
      uniswapV2PoolPriceFeed.getPoolTokenUnderlyings,
      {
        token0_: bat,
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
      token0: bat,
      token1: mln,
    });
    expect(events[1]).toMatchEventArgs({
      poolToken: primitive0Derivative1Pair,
      token0: bat,
      token1: cdai,
    });
    expect(events[2]).toMatchEventArgs({
      poolToken: derivative0Primitive1Pair,
      token0: cdai,
      token1: weth,
    });
  });
});
