import { EthereumTestnetProvider } from '@crestproject/crestproject';
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
} from '@melonproject/protocol';
import {
  assertEvent,
  createNewFund,
  defaultTestDeployment,
  getAssetBalances,
  uniswapV2Lend,
  uniswapV2Redeem,
  uniswapV2TakeOrder,
} from '@melonproject/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await defaultTestDeployment(provider);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: deployment.tokens.weth,
  });

  const token1 = deployment.tokens.mln;
  const token0 = deployment.tokens.weth;

  const mockPair = config.derivatives.uniswapV2.mlnWeth;

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    mocks: { mockPair, token0, token1 },
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
        integratees: {
          uniswapV2: { router, factory },
        },
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
      config: { mln: tokenA, weth: tokenB },
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
        mln: tokenA,
        weth: tokenB,
        derivatives: {
          uniswapV2: { mlnWeth: poolToken },
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
        mln: tokenA,
        weth: tokenB,
        derivatives: {
          uniswapV2: { mlnWeth: poolToken },
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
      config: { mln: tokenA, weth: tokenB },
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
        derivatives: {
          uniswapV2: { mlnWeth: poolToken },
        },
      },
      deployment: {
        uniswapV2Adapter,
        integrationManager,
        tokens: { mln: tokenA, weth: tokenB },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const poolTokenContract = new StandardToken(poolToken, provider);

    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');

    // Seed fund
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);

    const preTxPoolTokenBalance = await poolTokenContract.balanceOf(vaultProxy);
    const preTxTokenBalances = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB],
    });

    const poolTokenTotalSupply = await poolTokenContract.totalSupply();
    const reservesA = await tokenA.balanceOf(poolToken);
    const reservesB = await tokenB.balanceOf(poolToken);
    expect(reservesA).toEqBigNumber(reservesB);

    // Rates are calculated under the asumption of equal reserves
    expect(reservesA).toEqBigNumber(reservesB);

    const expectedRate = poolTokenTotalSupply.mul(utils.parseEther('1')).div(reservesA);
    const expectedIncomingAmount = amountADesired.mul(expectedRate).div(utils.parseEther('1'));

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
      incomingAssets: [poolTokenContract],
      incomingAssetAmounts: [expectedIncomingAmount],
      outgoingAssets: [tokenA, tokenB],
      outgoingAssetAmounts: [amountADesired, amountBDesired],
      integrationData: expect.anything(),
    });
    const postTxPoolTokenBalance = await poolTokenContract.balanceOf(vaultProxy);
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
      config: { mln: tokenA, weth: tokenB },
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
        deployer,
        derivatives: {
          uniswapV2: { mlnWeth: poolToken },
        },
      },
      deployment: {
        uniswapV2Adapter,
        integrationManager,
        tokens: { mln: tokenA, weth: tokenB },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);
    const poolTokenAmount = utils.parseEther('1');
    const poolTokenContract = new StandardToken(poolToken, provider);
    const poolTokenTotalSupply = await poolTokenContract.totalSupply();

    const reservesA = await tokenA.balanceOf(poolToken);
    const reservesB = await tokenB.balanceOf(poolToken);

    const expectedRate = reservesA.mul(utils.parseEther('1')).div(poolTokenTotalSupply);
    const expectedIncomingAmount = poolTokenAmount.mul(expectedRate).div(utils.parseEther('1'));

    // Rates are calculated under the asumption of equal reserves
    expect(reservesA).toEqBigNumber(reservesB);

    // seed fund
    await poolTokenContract.connect(deployer).transfer(vaultProxy, poolTokenAmount);

    const preTxPoolTokenBalance = await poolTokenContract.balanceOf(vaultProxy);
    const preTxTokenBalances = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB],
    });

    const receipt = await uniswapV2Redeem({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      poolTokenAmount,
      tokenA,
      tokenB,
      amountAMin: expectedIncomingAmount,
      amountBMin: expectedIncomingAmount,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      vaultProxy: vaultProxy,
      caller: fundOwner,
      adapter: uniswapV2Adapter,
      selector: redeemSelector,
      incomingAssets: [tokenA, tokenB],
      incomingAssetAmounts: [expectedIncomingAmount, expectedIncomingAmount],
      outgoingAssets: [poolTokenContract],
      outgoingAssetAmounts: [poolTokenAmount],
      integrationData: expect.anything(),
    });

    const postTxPoolTokenBalance = await poolTokenContract.balanceOf(vaultProxy);
    const postTxTokenBalances = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB],
    });

    expect(postTxTokenBalances[0]).toEqBigNumber(preTxTokenBalances[0].add(expectedIncomingAmount));
    expect(postTxTokenBalances[1]).toEqBigNumber(preTxTokenBalances[1].add(expectedIncomingAmount));
    expect(postTxPoolTokenBalance).toEqBigNumber(preTxPoolTokenBalance.sub(poolTokenAmount));
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: {
        tokens: { mln: outgoingAsset, weth: incomingAsset },
        uniswapV2Adapter,
      },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

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
      deployment: {
        uniswapV2Adapter,
        integrationManager,
        tokens: { mln: outgoingAsset },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

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
      deployment: {
        uniswapV2Adapter,
        integrationManager,
        tokens: { mln: outgoingAsset, dai: incomingAsset },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const outgoingAssetAmount = utils.parseEther('1');
    const expectedIncomingAssetAmount = utils.parseEther('1');

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
