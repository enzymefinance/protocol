import { IUniswapV2Pair, min, StandardToken, UniswapV2Router } from '@enzymefinance/protocol';
import {
  createNewFund,
  ProtocolDeployment,
  getAssetBalances,
  deployProtocolFixture,
  uniswapV2Lend,
  uniswapV2Redeem,
  uniswapV2TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('lend', () => {
  it('works as expected with exact amountADesired and amountBDesired amounts', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const tokenA = new StandardToken(fork.config.primitives.mln, whales.mln);
    const tokenB = weth;
    const poolToken = new StandardToken(fork.config.uniswap.pools.wethMln, provider);
    const uniswapPair = new IUniswapV2Pair(poolToken.address, provider);
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Define lend tx values
    const amountADesired = utils.parseEther('1');
    const amountAMin = BigNumber.from(1);
    const amountBMin = BigNumber.from(1);
    const minPoolTokenAmount = BigNumber.from(1);

    // Calc amountBDesired relative to amountADesired
    const getReservesRes = await uniswapPair.getReserves();
    const [tokenAReserve, tokenBReserve] =
      (await uniswapPair.token0()) == tokenA.address
        ? [getReservesRes[0], getReservesRes[1]]
        : [getReservesRes[1], getReservesRes[0]];
    const amountBDesired = await uniswapRouter.quote(amountADesired, tokenAReserve, tokenBReserve);

    // Calc expected pool tokens to receive
    const poolTokensSupply = await poolToken.totalSupply();
    const expectedPoolTokens = min(
      amountADesired.mul(poolTokensSupply).div(tokenAReserve),
      amountBDesired.mul(poolTokensSupply).div(tokenBReserve),
    );

    // Seed fund with tokens and lend
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);
    await uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      uniswapV2Adapter: fork.deployment.uniswapV2Adapter,
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      minPoolTokenAmount,
    });

    // Get pre-tx balances of all tokens
    const [postTxTokenABalance, postTxTokenBBalance, postTxPoolTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB, poolToken],
    });

    // Assert the exact amounts of tokens expected
    expect(postTxPoolTokenBalance).toEqBigNumber(expectedPoolTokens);
    expect(postTxTokenABalance).toEqBigNumber(0);
    expect(postTxTokenBBalance).toEqBigNumber(0);
  });
});

describe('redeem', () => {
  it('works as expected', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const tokenA = new StandardToken(fork.config.primitives.mln, whales.mln);
    const tokenB = weth;
    const poolToken = new StandardToken(fork.config.uniswap.pools.wethMln, provider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund and lend arbitrary amounts of tokens for an arbitrary amount of pool tokens
    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);
    await uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      uniswapV2Adapter: fork.deployment.uniswapV2Adapter,
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin: BigNumber.from(1),
      amountBMin: BigNumber.from(1),
      minPoolTokenAmount: BigNumber.from(1),
    });

    // Get pre-redeem balances of all tokens
    const [preRedeemTokenABalance, preRedeemTokenBBalance, preRedeemPoolTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB, poolToken],
    });

    // Define redeem params to redeem 1/2 of pool tokens
    const redeemPoolTokenAmount = preRedeemPoolTokenBalance.div(2);
    expect(redeemPoolTokenAmount).not.toEqBigNumber(BigNumber.from(0));

    // Calc expected amounts of tokens to receive
    const poolTokensSupply = await poolToken.totalSupply();
    const [poolTokenABalance, poolTokenBBalance] = await getAssetBalances({
      account: poolToken,
      assets: [tokenA, tokenB],
    });
    const expectedTokenAAmount = redeemPoolTokenAmount.mul(poolTokenABalance).div(poolTokensSupply);
    const expectedTokenBAmount = redeemPoolTokenAmount.mul(poolTokenBBalance).div(poolTokensSupply);

    await uniswapV2Redeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      uniswapV2Adapter: fork.deployment.uniswapV2Adapter,
      poolTokenAmount: redeemPoolTokenAmount,
      tokenA,
      tokenB,
      amountAMin: BigNumber.from(1),
      amountBMin: BigNumber.from(1),
    });

    // Get post-redeem balances of all tokens
    const [postRedeemTokenABalance, postRedeemTokenBBalance, postRedeemPoolTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB, poolToken],
    });

    // Assert the exact amounts of tokens expected
    expect(postRedeemPoolTokenBalance).toEqBigNumber(preRedeemPoolTokenBalance.sub(redeemPoolTokenAmount));
    expect(postRedeemTokenABalance).toEqBigNumber(preRedeemTokenABalance.add(expectedTokenAAmount));
    expect(postRedeemTokenBBalance).toEqBigNumber(preRedeemTokenBBalance.add(expectedTokenBAmount));
  });
});

describe('takeOrder', () => {
  it('can swap assets directly', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);
    const incomingAsset = weth;
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const path = [outgoingAsset, incomingAsset];
    const outgoingAssetAmount = utils.parseEther('0.1');
    const amountsOut = await uniswapRouter.getAmountsOut(outgoingAssetAmount, path);

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    // Seed fund and take order
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
    await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      uniswapV2Adapter: fork.deployment.uniswapV2Adapter,
      path,
      outgoingAssetAmount,
      minIncomingAssetAmount: amountsOut[1],
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
    expect(incomingAssetAmount).toEqBigNumber(amountsOut[1]);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });

  it('can swap assets via an intermediary', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);
    const incomingAsset = new StandardToken(fork.config.primitives.knc, provider);
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const path = [outgoingAsset, weth, incomingAsset];
    const outgoingAssetAmount = utils.parseEther('0.1');
    const amountsOut = await uniswapRouter.getAmountsOut(outgoingAssetAmount, path);

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Seed fund and take order
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
    await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      uniswapV2Adapter: fork.deployment.uniswapV2Adapter,
      path,
      outgoingAssetAmount,
      minIncomingAssetAmount: amountsOut[1],
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
    expect(incomingAssetAmount).toEqBigNumber(amountsOut[2]);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });
});
