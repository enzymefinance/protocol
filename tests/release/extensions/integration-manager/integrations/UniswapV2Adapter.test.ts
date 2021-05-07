import {
  assetTransferArgs,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
  takeOrderSelector,
  uniswapV2LendArgs,
  uniswapV2RedeemArgs,
  uniswapV2TakeOrderArgs,
  min,
  IUniswapV2Pair,
  UniswapV2Router,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  uniswapV2Lend,
  uniswapV2Redeem,
  uniswapV2TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployer,
    deployment,
    config,
  } = await deployProtocolFixture();

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: new StandardToken(config.weth, deployer),
  });

  return {
    accounts: remainingAccounts,
    deployer,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { uniswapV2Adapter, integrationManager },
      config: {
        uniswap: { router, factory },
      },
    } = await provider.snapshot(snapshot);

    const getRouterCall = await uniswapV2Adapter.getRouter();
    expect(getRouterCall).toMatchAddress(router);

    const getFactoryCall = await uniswapV2Adapter.getFactory();
    expect(getFactoryCall).toMatchAddress(factory);

    const getIntegrationManagerCall = await uniswapV2Adapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(integrationManager);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      config: {
        primitives: { mln: tokenA },
        weth: tokenB,
      },
      deployment: { uniswapV2Adapter },
    } = await provider.snapshot(snapshot);

    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = amountADesired;
    const amountBMin = amountBDesired;
    const minPoolTokenAmount = utils.parseEther('1');

    const args = uniswapV2LendArgs({
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      minPoolTokenAmount,
    });

    await expect(uniswapV2Adapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(uniswapV2Adapter.parseAssetsForMethod(lendSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const {
      config: {
        primitives: { mln: tokenA },
        weth: tokenB,
        uniswap: {
          pools: { wethMln: poolToken },
        },
      },
      deployment: { uniswapV2Adapter },
    } = await provider.snapshot(snapshot);

    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = amountADesired;
    const amountBMin = amountBDesired;
    const minPoolTokenAmount = utils.parseEther('1');

    const lendArgs = uniswapV2LendArgs({
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      minPoolTokenAmount,
    });

    const selector = lendSelector;
    const result = await uniswapV2Adapter.parseAssetsForMethod(selector, lendArgs);

    expect(result).toMatchFunctionOutput(uniswapV2Adapter.parseAssetsForMethod, {
      incomingAssets_: [poolToken],
      spendAssets_: [tokenA, tokenB],
      spendAssetAmounts_: [amountADesired, amountBDesired],
      minIncomingAssetAmounts_: [minPoolTokenAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
    });
  });

  it('generates expected output for redeeming', async () => {
    const {
      config: {
        primitives: { mln: tokenA },
        weth: tokenB,
        uniswap: {
          pools: { wethMln: poolToken },
        },
      },
      deployment: { uniswapV2Adapter },
    } = await provider.snapshot(snapshot);

    const poolTokenAmount = utils.parseEther('0.5');
    const amountAMin = utils.parseEther('1');
    const amountBMin = utils.parseEther('1');

    const redeemArgs = uniswapV2RedeemArgs({
      poolTokenAmount,
      tokenA,
      tokenB,
      amountAMin,
      amountBMin,
    });

    const selector = redeemSelector;
    const result = await uniswapV2Adapter.parseAssetsForMethod(selector, redeemArgs);

    expect(result).toMatchFunctionOutput(uniswapV2Adapter.parseAssetsForMethod, {
      incomingAssets_: [tokenA, tokenB],
      spendAssets_: [poolToken],
      spendAssetAmounts_: [poolTokenAmount],
      minIncomingAssetAmounts_: [amountAMin, amountBMin],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
    });
  });
});

describe('lend', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      config: {
        primitives: { mln: tokenA },
        weth: tokenB,
      },
      deployment: { uniswapV2Adapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const lendArgs = uniswapV2LendArgs({
      tokenA,
      tokenB,
      amountADesired: utils.parseEther('1'),
      amountBDesired: utils.parseEther('1'),
      amountAMin: utils.parseEther('1'),
      amountBMin: utils.parseEther('1'),
      minPoolTokenAmount: utils.parseEther('1'),
    });

    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2Adapter,
      selector: lendSelector,
      encodedCallArgs: lendArgs,
    });

    await expect(uniswapV2Adapter.lend(vaultProxy, lendArgs, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund', async () => {
    const {
      config: {
        primitives: { mln },
        weth,
        uniswap: {
          router,
          pools: { wethMln },
        },
      },
      deployment: { uniswapV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const tokenA = new StandardToken(mln, whales.mln);
    const tokenB = new StandardToken(weth, whales.weth);
    const poolToken = new StandardToken(wethMln, provider);

    const uniswapPair = new IUniswapV2Pair(poolToken, provider);
    const uniswapRouter = new UniswapV2Router(router, provider);

    const amountADesired = utils.parseEther('1');

    // Calc amountBDesired relative to amountADesired
    const getReservesRes = await uniswapPair.getReserves();
    const [reservesA, reservesB] =
      (await uniswapPair.token0()) == tokenA.address
        ? [getReservesRes[0], getReservesRes[1]]
        : [getReservesRes[1], getReservesRes[0]];
    const amountBDesired = await uniswapRouter.quote(amountADesired, reservesA, reservesB);

    // Seed fund
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);

    const preTxPoolTokenBalance = await poolToken.balanceOf(vaultProxy);
    const preTxTokenBalances = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB],
    });

    const poolTokenTotalSupply = await poolToken.totalSupply();

    const expectedIncomingAmount = min(
      amountADesired.mul(poolTokenTotalSupply).div(reservesA),
      amountBDesired.mul(poolTokenTotalSupply).div(reservesB),
    );

    const receipt = await uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin: BigNumber.from('1'),
      amountBMin: BigNumber.from('1'),
      minPoolTokenAmount: BigNumber.from('1'),
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      vaultProxy: vaultProxy,
      caller: fundOwner,
      adapter: uniswapV2Adapter,
      selector: lendSelector,
      incomingAssets: [poolToken],
      incomingAssetAmounts: [expectedIncomingAmount],
      outgoingAssets: [tokenA, tokenB],
      outgoingAssetAmounts: [amountADesired, amountBDesired],
      integrationData: expect.anything(),
    });
    const postTxPoolTokenBalance = await poolToken.balanceOf(vaultProxy);
    const postTxTokenBalances = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB],
    });

    expect(postTxPoolTokenBalance).toEqBigNumber(preTxPoolTokenBalance.add(expectedIncomingAmount));
    expect(postTxTokenBalances[0]).toEqBigNumber(preTxTokenBalances[0].sub(amountADesired));
    expect(postTxTokenBalances[1]).toEqBigNumber(preTxTokenBalances[1].sub(amountBDesired));
  });
});

describe('redeem', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      config: {
        primitives: { mln: tokenA },
        weth: tokenB,
      },
      deployment: { uniswapV2Adapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const redeemArgs = uniswapV2RedeemArgs({
      poolTokenAmount: utils.parseEther('0.5'),
      tokenA,
      tokenB,
      amountAMin: utils.parseEther('1'),
      amountBMin: utils.parseEther('1'),
    });

    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2Adapter,
      selector: redeemSelector,
      encodedCallArgs: redeemArgs,
    });

    await expect(uniswapV2Adapter.redeem(vaultProxy, redeemArgs, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund', async () => {
    const {
      config: {
        primitives: { mln },
        weth,
        uniswap: {
          pools: { wethMln },
        },
      },
      deployment: { uniswapV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const tokenA = new StandardToken(mln, whales.mln);
    const tokenB = new StandardToken(weth, whales.weth);
    const poolToken = new StandardToken(wethMln, provider);

    // Seed fund and lend arbitrary amounts of tokens for an arbitrary amount of pool tokens
    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);

    await uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin: BigNumber.from('1'),
      amountBMin: BigNumber.from('1'),
      minPoolTokenAmount: BigNumber.from('1'),
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

    const receipt = await uniswapV2Redeem({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      poolTokenAmount: redeemPoolTokenAmount,
      tokenA,
      tokenB,
      amountAMin: BigNumber.from(1),
      amountBMin: BigNumber.from(1),
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      vaultProxy: vaultProxy,
      caller: fundOwner,
      adapter: uniswapV2Adapter,
      selector: redeemSelector,
      incomingAssets: [tokenA, tokenB],
      incomingAssetAmounts: [expectedTokenAAmount, expectedTokenBAmount],
      outgoingAssets: [poolToken],
      outgoingAssetAmounts: [redeemPoolTokenAmount],
      integrationData: expect.anything(),
    });

    // Get post-redeem balances of all tokens
    const [postRedeemTokenABalance, postRedeemTokenBBalance, postRedeemPoolTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB, poolToken],
    });

    expect(postRedeemTokenABalance).toEqBigNumber(preRedeemTokenABalance.add(expectedTokenAAmount));
    expect(postRedeemTokenBBalance).toEqBigNumber(preRedeemTokenBBalance.add(expectedTokenBAmount));
    expect(postRedeemPoolTokenBalance).toEqBigNumber(preRedeemPoolTokenBalance.sub(redeemPoolTokenAmount));
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      config: {
        weth,
        primitives: { mln },
      },
      deployment: { uniswapV2Adapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(mln, whales.mln);
    const incomingAsset = new StandardToken(weth, provider);

    const takeOrderArgs = uniswapV2TakeOrderArgs({
      path: [outgoingAsset, incomingAsset],
      outgoingAssetAmount: utils.parseEther('1'),
      minIncomingAssetAmount: utils.parseEther('1'),
    });
    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2Adapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(uniswapV2Adapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('does not allow a path with less than 2 assets', async () => {
    const {
      config: {
        primitives: { mln },
      },
      deployment: { uniswapV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(mln, whales.mln);

    await expect(
      uniswapV2TakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        uniswapV2Adapter,
        path: [outgoingAsset],
        outgoingAssetAmount: utils.parseEther('1'),
        minIncomingAssetAmount: utils.parseEther('1'),
      }),
    ).rejects.toBeRevertedWith('_path must be >= 2');
  });

  it('works as expected when called by a fund', async () => {
    const {
      config: {
        primitives: { mln, knc },
      },
      deployment: { uniswapV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(mln, whales.mln);
    const incomingAsset = new StandardToken(knc, provider);
    const path = [outgoingAsset, incomingAsset];

    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);

    const outgoingAssetAmount = utils.parseEther('0.1');
    const amountsOut = await uniswapRouter.getAmountsOut(outgoingAssetAmount, path);
    const expectedIncomingAssetAmount = amountsOut[1];

    // Seed fund with outgoing asset
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

    // Get the balances of the incoming and outgoing assets pre-trade
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Trade on Uniswap
    const receipt = await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      path: [outgoingAsset, incomingAsset],
      outgoingAssetAmount,
      minIncomingAssetAmount: expectedIncomingAssetAmount,
    });

    // Get the balances of the incoming and outgoing assets post-trade
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Assert the correct final token balances of incoming and outgoing assets
    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedIncomingAssetAmount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAssetAmount));

    // Assert the correct event was emitted
    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');
    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      adapter: uniswapV2Adapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: [outgoingAsset],
      outgoingAssetAmounts: [outgoingAssetAmount],
      integrationData: expect.anything(),
    });
  });
});
