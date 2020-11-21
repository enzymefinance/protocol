import { EthereumTestnetProvider, extractEvent, randomAddress } from '@crestproject/crestproject';
import { IUniswapV2Pair, MockToken, MockUniswapV2Pair, StandardToken } from '@melonproject/protocol';
import { defaultTestDeployment } from '@melonproject/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  return {
    accounts,
    deployment,
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

// TODO: refactor these tests after fixing the mock contracts
describe('getRatesToUnderlyings', () => {
  xit('returns rate for 18 decimals underlying assets', async () => {
    const {
      config: {
        derivatives: {
          uniswapV2: { mlnWeth: derivativeAsset },
        },
      },
      deployment: {
        uniswapV2PoolPriceFeed,
        tokens: { mln, weth },
      },
    } = await provider.snapshot(snapshot);

    const derivativeAssetContract = new StandardToken(derivativeAsset, provider);
    const totalSupply = await derivativeAssetContract.totalSupply();
    const mlnAmount = utils.parseEther('1');
    const wethAmount = utils.parseEther('1');

    await mln.transfer(derivativeAsset, mlnAmount);
    await weth.transfer(derivativeAsset, wethAmount);

    const getRatesToUnderlyings = await uniswapV2PoolPriceFeed.getRatesToUnderlyings.args(derivativeAsset).call();

    const ratePricision = BigNumber.from(10).pow(18);
    expect(getRatesToUnderlyings).toMatchFunctionOutput(uniswapV2PoolPriceFeed.getRatesToUnderlyings, {
      rates_: [mlnAmount.mul(ratePricision).div(totalSupply), wethAmount.mul(ratePricision).div(totalSupply)],
      underlyings_: [mln, weth],
    });
  });

  xit('returns rate for non-18 decimals underlying assets', async () => {
    const {
      config: { deployer },
      deployment: {
        uniswapV2PoolPriceFeed,
        tokens: { weth },
      },
    } = await provider.snapshot(snapshot);

    const mln = await MockToken.deploy(deployer, 'mln', 'MLN', 17);
    const derivativeAsset = await MockUniswapV2Pair.deploy(deployer, mln, weth);
    const derivativeAssetContract = new StandardToken(derivativeAsset, provider);
    const totalSupply = await derivativeAssetContract.totalSupply();
    const mlnAmount = utils.parseEther('1');
    const wethAmount = utils.parseEther('1');

    await mln.transfer(derivativeAsset, mlnAmount);
    await weth.transfer(derivativeAsset, wethAmount);

    const getRatesToUnderlyings = await uniswapV2PoolPriceFeed.getRatesToUnderlyings.args(derivativeAsset).call();

    const pow17 = BigNumber.from(10).pow(17);
    const pow18 = BigNumber.from(10).pow(18);

    expect(getRatesToUnderlyings).toMatchFunctionOutput(uniswapV2PoolPriceFeed.getRatesToUnderlyings, {
      rates_: [mlnAmount.mul(pow18).div(pow17).mul(pow18).div(totalSupply), wethAmount.mul(pow18).div(totalSupply)],
      underlyings_: [mln, weth],
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
        compoundTokens: { cdai, ccomp },
        uniswapV2PoolPriceFeed,
        tokens: { weth },
      },
    } = await provider.snapshot(snapshot);

    const unsupportedToken = await MockToken.deploy(deployer, 'Unsupported Token', 'UN', 18);
    const revertReason = 'Unsupported pool token';

    const derivative0Derivative1Pair = await MockUniswapV2Pair.deploy(deployer, cdai, ccomp);
    await expect(uniswapV2PoolPriceFeed.addPoolTokens([derivative0Derivative1Pair])).rejects.toBeRevertedWith(
      revertReason,
    );

    const primitive0Unsupported1Pair = await MockUniswapV2Pair.deploy(deployer, weth, unsupportedToken);
    await expect(uniswapV2PoolPriceFeed.addPoolTokens([primitive0Unsupported1Pair])).rejects.toBeRevertedWith(
      revertReason,
    );

    const Unsupported0Primitive1Pair = await MockUniswapV2Pair.deploy(deployer, unsupportedToken, weth);
    await expect(uniswapV2PoolPriceFeed.addPoolTokens([Unsupported0Primitive1Pair])).rejects.toBeRevertedWith(
      revertReason,
    );
  });

  it('adds pool tokens and emits an event per added pool token', async () => {
    const {
      config: { deployer },
      deployment: {
        compoundTokens: { cdai },
        uniswapV2PoolPriceFeed,
        tokens: { weth, mln },
      },
    } = await provider.snapshot(snapshot);

    // Create valid pool tokens (all possible valid types)
    const primitive0Primitive1Pair = await MockUniswapV2Pair.deploy(deployer, weth, mln);
    const primitive0Derivative1Pair = await MockUniswapV2Pair.deploy(deployer, weth, cdai);
    const derivative0Primitive1Pair = await MockUniswapV2Pair.deploy(deployer, cdai, weth);

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
