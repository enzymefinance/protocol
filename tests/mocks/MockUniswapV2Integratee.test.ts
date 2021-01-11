import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { MockUniswapV2PriceSource } from '@enzymefinance/protocol';
import { randomizedTestDeployment } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await randomizedTestDeployment(provider);

  const token0 = deployment.tokens.mln;
  const token1 = deployment.tokens.knc;

  // Create a pair that hasn't been deployed before
  const mockPair = await MockUniswapV2PriceSource.deploy(config.deployer, token0, token1);
  await mockPair.mintFor(deployment.uniswapV2Integratee, utils.parseEther('100000'));

  await token0.transfer(mockPair, utils.parseEther('10000'));
  await token1.transfer(mockPair, utils.parseEther('10000'));

  await deployment.uniswapV2PoolPriceFeed.addPoolTokens([mockPair]);
  await deployment.uniswapV2Integratee.addPair([token0], [token1], [mockPair]);
  await deployment.aggregatedDerivativePriceFeed.addDerivatives([mockPair], [deployment.uniswapV2PoolPriceFeed]);

  return { accounts, deployment, mocks: { mockPair }, config };
}

describe('getAmountsOut', () => {
  it('correctly retrieves getAmountsOut from an integratee', async () => {
    const {
      deployment: {
        centralizedRateProvider,
        tokens: { knc, mln },
        chainlinkAggregators: { knc: aggregatorKnc, mln: aggregatorMln },
        uniswapV2Integratee,
      },
    } = await provider.snapshot(snapshot);

    // Set initial rates for base and quote assets
    const answerKnc = utils.parseEther('500');
    const answerMln = utils.parseEther('1');

    await aggregatorKnc.setLatestAnswer(answerKnc, BigNumber.from('1'));
    await aggregatorMln.setLatestAnswer(answerMln, BigNumber.from('1'));

    const senderDeviation = await centralizedRateProvider.getMaxDeviationPerSender();
    const blockNumberDeviation = await uniswapV2Integratee.getBlockNumberDeviation();
    const worstCaseSlippage = blockNumberDeviation.add(senderDeviation);

    const amount = utils.parseEther('1');
    const path = [knc.address, mln.address];

    const [, amountOut] = await uniswapV2Integratee.getAmountsOut.args(amount, path).call();

    const worstRateExpected = answerKnc
      .mul(utils.parseEther('1'))
      .div(answerMln)
      .mul(BigNumber.from('100').sub(worstCaseSlippage))
      .div(100);

    const bestRateExpected = answerKnc
      .mul(utils.parseEther('1'))
      .div(answerMln)
      .mul(BigNumber.from('100').add(worstCaseSlippage))
      .div(100);

    expect(amountOut).toBeGteBigNumber(worstRateExpected);
    expect(amountOut).toBeLteBigNumber(bestRateExpected);
  });
});

describe('swapExactTokensForTokens', () => {
  it('receives the expected amount of assets from a swap', async () => {
    const {
      config: { deployer },
      deployment: {
        tokens: { knc, mln },
        chainlinkAggregators: { knc: aggregatorKnc, mln: aggregatorMln },
        uniswapV2Integratee,
      },
    } = await provider.snapshot(snapshot);

    const answerKnc = utils.parseEther('500');
    const answerMln = utils.parseEther('1');

    await aggregatorKnc.setLatestAnswer(answerKnc, BigNumber.from('1'));
    await aggregatorMln.setLatestAnswer(answerMln, BigNumber.from('1'));

    const blockNumberDeviation = await uniswapV2Integratee.getBlockNumberDeviation();

    await knc.approve(uniswapV2Integratee.address, utils.parseEther('1'));
    const amount = utils.parseEther('1');
    const path = [knc.address, mln.address];

    const [, amountOut] = await uniswapV2Integratee.getAmountsOut.args(amount, path).call();

    const preBalance = await mln.balanceOf(deployer.address);
    await uniswapV2Integratee.swapExactTokensForTokens(
      utils.parseEther('1'),
      utils.parseEther('1'),
      path,
      randomAddress(),
      1,
    );
    const postBalance = await mln.balanceOf(deployer.address);
    const balanceDiff = postBalance.sub(preBalance);

    expect(balanceDiff).toBeGteBigNumber(amountOut.mul(BigNumber.from('1').sub(blockNumberDeviation)));
    expect(balanceDiff).toBeLteBigNumber(amountOut.mul(BigNumber.from('1').add(blockNumberDeviation)));
  });
});

describe('addPair', () => {
  it('adds a set of pairs', async () => {
    const {
      deployment: { uniswapV2Integratee },
    } = await provider.snapshot(snapshot);

    const listOfToken0 = [randomAddress(), randomAddress()];
    const listOfToken1 = [randomAddress(), randomAddress()];
    const listOfPairs = [randomAddress(), randomAddress()];

    await uniswapV2Integratee.addPair(listOfToken0, listOfToken1, listOfPairs);

    const pair0 = await uniswapV2Integratee.getPair(listOfToken0[0], listOfToken1[0]);
    const pair1 = await uniswapV2Integratee.getPair(listOfToken0[1], listOfToken1[1]);

    expect(pair0).toMatchAddress(listOfPairs[0]);
    expect(pair1).toMatchAddress(listOfPairs[1]);
  });
});

describe('addLiquidity', () => {
  it('correctly adds liquidity and receives corresponding pairTokens', async () => {
    const {
      config: { deployer },
      deployment: {
        tokens: { knc: token0, mln: token1 },
        chainlinkAggregators: { knc: aggregatorKnc, mln: aggregatorMln },
        valueInterpreter,
        uniswapV2Integratee,
      },
      mocks: { mockPair },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('10');
    token0.approve(uniswapV2Integratee, amount);
    token1.approve(uniswapV2Integratee, amount);

    // Set initial rates for base and quote assets
    const answerKnc = utils.parseEther('500');
    const answerMln = utils.parseEther('1');

    await aggregatorKnc.setLatestAnswer(answerKnc, BigNumber.from('1'));
    await aggregatorMln.setLatestAnswer(answerMln, BigNumber.from('1'));

    const preLiquidityBalance = await mockPair.balanceOf(deployer);
    const preToken0Balance = await token0.balanceOf(deployer);
    const preToken1Balance = await token1.balanceOf(deployer);

    await uniswapV2Integratee.addLiquidity(
      token0,
      token1,
      amount,
      amount,
      BigNumber.from('0'),
      BigNumber.from('0'),
      randomAddress(),
      BigNumber.from('0'),
    );

    const postLiquidityBalance = await mockPair.balanceOf(deployer);
    const postToken0Balance = await token0.balanceOf(deployer);
    const postToken1Balance = await token1.balanceOf(deployer);

    const token0LiquidityAdded = preToken0Balance.sub(postToken0Balance);
    const token1LiquidityAdded = preToken1Balance.sub(postToken1Balance);
    const pairTokenReceived = postLiquidityBalance.sub(preLiquidityBalance);

    const valueOfToken0LiquidityAdded = (
      await valueInterpreter.calcCanonicalAssetValue.args(token0, token0LiquidityAdded, token0).call()
    ).value_;

    const valueOfToken1LiquidityAdded = (
      await valueInterpreter.calcCanonicalAssetValue.args(token1, token1LiquidityAdded, token0).call()
    ).value_;

    const valueOfPairReceived = (
      await valueInterpreter.calcCanonicalAssetValue.args(mockPair, pairTokenReceived, token0).call()
    ).value_;

    expect(valueOfPairReceived).toBeGtBigNumber(
      valueOfToken0LiquidityAdded.add(valueOfToken1LiquidityAdded).mul(999).div(1000),
    );
    expect(valueOfPairReceived).toBeLteBigNumber(
      valueOfToken0LiquidityAdded.add(valueOfToken1LiquidityAdded).mul(1001).div(1000),
    );
  });
});

describe('removeLiquidity', () => {
  it('correctly removes liquidity and receives corresponding tokens', async () => {
    const {
      config: { deployer },
      deployment: {
        tokens: { mln: token0, knc: token1, weth: referenceToken },
        valueInterpreter,
        uniswapV2Integratee,
      },
      mocks: { mockPair },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');
    mockPair.approve(uniswapV2Integratee, amount);

    const preLiquidityBalance = await mockPair.balanceOf(deployer);
    const preToken0Balance = await token0.balanceOf(deployer);
    const preToken1Balance = await token1.balanceOf(deployer);

    await uniswapV2Integratee.removeLiquidity(
      token0,
      token1,
      amount,
      BigNumber.from('0'),
      BigNumber.from('0'),
      randomAddress(),
      BigNumber.from('0'),
    );

    const postLiquidityBalance = await mockPair.balanceOf(deployer);
    const postToken0Balance = await token0.balanceOf(deployer);
    const postToken1Balance = await token1.balanceOf(deployer);

    const token0Received = postToken0Balance.sub(preToken0Balance);
    const token1Received = postToken1Balance.sub(preToken1Balance);
    const pairTokenRemoved = preLiquidityBalance.sub(postLiquidityBalance);

    const valueOfToken0Received = (
      await valueInterpreter.calcCanonicalAssetValue.args(token0, token0Received, referenceToken).call()
    ).value_;

    const valueOfToken1LiquidityReceived = (
      await valueInterpreter.calcCanonicalAssetValue.args(token1, token1Received, referenceToken).call()
    ).value_;

    const valueOfPairRemoved = (
      await valueInterpreter.calcCanonicalAssetValue.args(mockPair, pairTokenRemoved, referenceToken).call()
    ).value_;

    expect(valueOfPairRemoved).toEqBigNumber(valueOfToken0Received.add(valueOfToken1LiquidityReceived));
  });
});
