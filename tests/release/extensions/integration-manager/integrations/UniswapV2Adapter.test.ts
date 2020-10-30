// TODO: NEED TO REVIEW THESE TESTS

import { utils, Signer, BigNumberish } from 'ethers';
import {
  EthereumTestnetProvider,
  resolveAddress,
} from '@crestproject/crestproject';
import {
  ComptrollerLib,
  IntegrationManager,
  StandardToken,
  UniswapV2Adapter,
  VaultLib,
} from '@melonproject/protocol';
import {
  assertEvent,
  assetTransferArgs,
  createNewFund,
  defaultTestDeployment,
  getAssetBalances,
  lendSelector,
  redeemSelector,
  takeOrderSelector,
  uniswapV2Lend,
  uniswapV2LendArgs,
  uniswapV2Redeem,
  uniswapv2RedeemArgs,
  uniswapV2TakeOrder,
  uniswapv2TakeOrderArgs,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  const [fundOwner, ...remainingAccounts] = accounts;
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: deployment.tokens.weth,
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

async function assertUniswapV2TakeOrder({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  uniswapV2Adapter,
  path,
  outgoingAssetAmount,
  minIncomingAssetAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  uniswapV2Adapter: UniswapV2Adapter;
  path: StandardToken[];
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount: BigNumberish;
}) {
  const outgoingAsset = path[0];
  const incomingAsset = path[path.length - 1];

  // seed fund
  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

  const [
    preTxIncomingAssetBalance,
    preTxOutgoingAssetBalance,
  ] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });

  const takeOrderTx = uniswapV2TakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    uniswapV2Adapter,
    path,
    outgoingAssetAmount,
    minIncomingAssetAmount,
  });

  const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
    'CallOnIntegrationExecutedForFund',
  );
  await assertEvent(takeOrderTx, CallOnIntegrationExecutedForFundEvent, {
    comptrollerProxy: comptrollerProxy.address,
    vaultProxy: vaultProxy.address,
    caller: await fundOwner.getAddress(),
    adapter: uniswapV2Adapter.address,
    incomingAssets: [incomingAsset.address],
    incomingAssetAmounts: [minIncomingAssetAmount],
    outgoingAssets: [outgoingAsset.address],
    outgoingAssetAmounts: [outgoingAssetAmount],
  });

  const [
    postTxIncomingAssetBalance,
    postTxOutgoingAssetBalance,
  ] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });

  // TODO: if we use rates other than 1:1, need to look up the actual rate
  const expectedIncomingAssetAmount = outgoingAssetAmount;
  expect(postTxIncomingAssetBalance).toEqBigNumber(
    preTxIncomingAssetBalance.add(expectedIncomingAssetAmount),
  );
  expect(postTxOutgoingAssetBalance).toEqBigNumber(
    preTxOutgoingAssetBalance.sub(outgoingAssetAmount),
  );
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

    const getRouterCall = uniswapV2Adapter.getRouter();
    await expect(getRouterCall).resolves.toBe(router);

    const getFactoryCall = uniswapV2Adapter.getFactory();
    await expect(getFactoryCall).resolves.toBe(factory);

    const getIntegrationManagerCall = uniswapV2Adapter.getIntegrationManager();
    await expect(getIntegrationManagerCall).resolves.toBe(
      integrationManager.address,
    );
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      config: {
        mln: tokenA,
        weth: tokenB,
        derivatives: {
          uniswapV2: { mlnWeth: incomingAsset },
        },
      },
      deployment: { uniswapV2Adapter },
    } = await provider.snapshot(snapshot);

    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = amountADesired;
    const amountBMin = amountBDesired;
    const minIncomingAssetAmount = utils.parseEther('1');

    const args = await uniswapV2LendArgs({
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      incomingAsset,
      minIncomingAssetAmount,
    });

    const badSelectorParseAssetsCall = uniswapV2Adapter.parseAssetsForMethod(
      utils.randomBytes(4),
      args,
    );
    await expect(badSelectorParseAssetsCall).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    const goodSelectorParseAssetsCall = uniswapV2Adapter.parseAssetsForMethod(
      lendSelector,
      args,
    );
    await expect(goodSelectorParseAssetsCall).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const {
      config: {
        mln: tokenA,
        weth: tokenB,
        derivatives: {
          uniswapV2: { mlnWeth: incomingAsset },
        },
      },
      deployment: { uniswapV2Adapter },
    } = await provider.snapshot(snapshot);

    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = amountADesired;
    const amountBMin = amountBDesired;
    const minIncomingAssetAmount = utils.parseEther('1');

    const lendArgs = await uniswapV2LendArgs({
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      incomingAsset,
      minIncomingAssetAmount,
    });
    const selector = lendSelector;

    const {
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await uniswapV2Adapter.parseAssetsForMethod(selector, lendArgs);

    expect({
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      incomingAssets_: [await resolveAddress(incomingAsset)],
      spendAssets_: [tokenA, tokenB],
      spendAssetAmounts_: [amountADesired, amountBDesired],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });

  it('generates expected output for redeeming', async () => {
    const {
      config: {
        mln: tokenA,
        weth: tokenB,
        derivatives: {
          uniswapV2: { mlnWeth: outgoingAsset },
        },
      },
      deployment: { uniswapV2Adapter },
    } = await provider.snapshot(snapshot);

    const liquidity = utils.parseEther('0.5');
    const amountAMin = utils.parseEther('1');
    const amountBMin = utils.parseEther('1');

    const redeemArgs = await uniswapv2RedeemArgs({
      outgoingAsset,
      liquidity,
      tokenA,
      tokenB,
      amountAMin,
      amountBMin,
    });
    const selector = redeemSelector;

    const {
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    } = await uniswapV2Adapter.parseAssetsForMethod(selector, redeemArgs);

    expect({
      incomingAssets_,
      spendAssets_,
      spendAssetAmounts_,
      minIncomingAssetAmounts_,
    }).toMatchObject({
      incomingAssets_: [tokenA, tokenB],
      spendAssets_: [await resolveAddress(outgoingAsset)],
      spendAssetAmounts_: [liquidity],
      minIncomingAssetAmounts_: [amountAMin, amountBMin],
    });
  });
});

describe('lend', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      config: {
        mln: tokenA,
        weth: tokenB,
        derivatives: {
          uniswapV2: { mlnWeth: incomingAsset },
        },
      },
      deployment: { uniswapV2Adapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = amountADesired;
    const amountBMin = amountBDesired;
    const minIncomingAssetAmount = utils.parseEther('1');

    const lendArgs = await uniswapV2LendArgs({
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      incomingAsset,
      minIncomingAssetAmount,
    });

    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2Adapter,
      selector: lendSelector,
      encodedCallArgs: lendArgs,
    });

    const badLendTx = uniswapV2Adapter.lend(vaultProxy, lendArgs, transferArgs);
    await expect(badLendTx).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund', async () => {
    const {
      config: {
        derivatives: {
          uniswapV2: { mlnWeth: incomingAsset },
        },
      },
      deployment: {
        uniswapV2Adapter,
        integrationManager,
        tokens: { mln: tokenA, weth: tokenB },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const incomingAssetContract = new StandardToken(
      await resolveAddress(incomingAsset),
      provider,
    );

    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = amountADesired;
    const amountBMin = amountBDesired;

    // Seed fund
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAssetContract],
    });

    const preTxOutgoingAssetBalances = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB],
    });

    const lendTx = uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      incomingAsset,
      minIncomingAssetAmount: utils.parseEther('1'),
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );
    await assertEvent(lendTx, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      vaultProxy: vaultProxy.address,
      caller: await fundOwner.getAddress(),
      adapter: uniswapV2Adapter.address,
      incomingAssets: [incomingAssetContract.address],
      incomingAssetAmounts: [utils.parseEther('1')],
      outgoingAssets: [tokenA.address, tokenB.address],
      outgoingAssetAmounts: [amountADesired, amountBDesired],
    });

    const [postTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAssetContract],
    });

    const postTxOutgoingAssetBalances = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(
      preTxIncomingAssetBalance.add(amountADesired),
    );
    expect(postTxOutgoingAssetBalances[0]).toEqBigNumber(
      preTxOutgoingAssetBalances[0].sub(amountADesired),
    );
    expect(postTxOutgoingAssetBalances[1]).toEqBigNumber(
      preTxOutgoingAssetBalances[1].sub(amountBDesired),
    );
  });
});

describe('redeem', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      config: {
        mln: tokenA,
        weth: tokenB,
        derivatives: {
          uniswapV2: { mlnWeth: outgoingAsset },
        },
      },
      deployment: { uniswapV2Adapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const liquidity = utils.parseEther('0.5');
    const amountAMin = utils.parseEther('1');
    const amountBMin = utils.parseEther('1');

    const redeemArgs = await uniswapv2RedeemArgs({
      outgoingAsset,
      liquidity,
      tokenA,
      tokenB,
      amountAMin,
      amountBMin,
    });

    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2Adapter,
      selector: redeemSelector,
      encodedCallArgs: redeemArgs,
    });

    const redeemTx = uniswapV2Adapter.redeem(
      vaultProxy,
      redeemArgs,
      transferArgs,
    );
    await expect(redeemTx).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund', async () => {
    const {
      config: {
        derivatives: {
          uniswapV2: { mlnWeth: outgoingAsset },
        },
      },
      deployment: {
        deployer,
        uniswapV2Adapter,
        integrationManager,
        tokens: { mln: tokenA, weth: tokenB },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const liquidity = utils.parseEther('0.5');
    const amountAMin = utils.parseEther('1');
    const amountBMin = utils.parseEther('1');
    const outgoingAssetContract = new StandardToken(
      await resolveAddress(outgoingAsset),
      provider,
    );

    // seed fund
    await outgoingAssetContract
      .connect(provider.getSigner(deployer))
      .transfer(vaultProxy, liquidity);

    const preTxIncomingAssetBalances = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB],
    });
    const [preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [outgoingAssetContract],
    });

    const redeemTx = uniswapV2Redeem({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      outgoingAsset,
      liquidity,
      tokenA,
      tokenB,
      amountAMin,
      amountBMin,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent(
      'CallOnIntegrationExecutedForFund',
    );
    await assertEvent(redeemTx, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      vaultProxy: vaultProxy.address,
      caller: await fundOwner.getAddress(),
      adapter: uniswapV2Adapter.address,
      incomingAssets: [tokenA.address, tokenB.address],
      incomingAssetAmounts: [amountAMin, amountBMin],
      outgoingAssets: [outgoingAssetContract.address],
      outgoingAssetAmounts: [liquidity],
    });

    const postTxIncomingAssetBalances = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB],
    });
    const [postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [outgoingAssetContract],
    });

    expect(postTxIncomingAssetBalances[0]).toEqBigNumber(
      preTxIncomingAssetBalances[0].add(amountAMin),
    );
    expect(postTxIncomingAssetBalances[1]).toEqBigNumber(
      preTxIncomingAssetBalances[1].add(amountBMin),
    );
    expect(postTxOutgoingAssetBalance).toEqBigNumber(
      preTxOutgoingAssetBalance.sub(liquidity),
    );
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: {
        tokens: { mln: tokenA, weth: tokenB },
        uniswapV2Adapter,
      },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const takeOrderArgs = await uniswapv2TakeOrderArgs({
      path: [tokenA, tokenB],
      outgoingAssetAmount: utils.parseEther('1'),
      minIncomingAssetAmount: utils.parseEther('1'),
    });
    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2Adapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    const badTakeOrderTx = uniswapV2Adapter.takeOrder(
      vaultProxy,
      takeOrderSelector,
      transferArgs,
    );
    await expect(badTakeOrderTx).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('does not allow empty minimum asset amount', async () => {
    const {
      deployment: {
        uniswapV2Adapter,
        tokens: { weth: outgoingAsset, mln: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const badTakeOrderTx = uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      path: [outgoingAsset, incomingAsset],
      outgoingAssetAmount: utils.parseEther('1'),
      minIncomingAssetAmount: 0,
      seedFund: true,
    });

    await expect(badTakeOrderTx).rejects.toBeRevertedWith(
      'minIncomingAssetAmount must be >0',
    );
  });

  it('works as expected when called by a fund (ETH to ERC20)', async () => {
    const {
      deployment: {
        uniswapV2Adapter,
        integrationManager,
        tokens: { weth: outgoingAsset, mln: incomingAsset },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      // config: {
      // integratees: { uniswapV2: { router } },
      // }
    } = await provider.snapshot(snapshot);

    const outgoingAssetAmount = utils.parseEther('1');
    const minIncomingAssetAmount = utils.parseEther('1');

    // const a = await getAssetBalances({
    // account: router,
    // assets: [incomingAsset],
    // })

    await assertUniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      path: [outgoingAsset, incomingAsset],
      outgoingAssetAmount,
      minIncomingAssetAmount,
    });
  });

  // it('works as expected when called by a fund (ERC20 to ETH)', async () => {
  // const {
  // deployment: {
  // uniswapV2Adapter,
  // integrationManager,
  // tokens: { mln: tokenA, weth: tokenB },
  // },
  // fund: { comptrollerProxy, fundOwner, vaultProxy },
  // } = await provider.snapshot(snapshot);

  // const outgoingAssetAmount = utils.parseEther('1');
  // const minIncomingAssetAmount = utils.parseEther('1');

  // await assertUniswapV2TakeOrder({
  // comptrollerProxy,
  // vaultProxy,
  // integrationManager,
  // fundOwner,
  // uniswapV2Adapter,
  // path: [tokenA, tokenB],
  // outgoingAssetAmount,
  // minIncomingAssetAmount,
  // });
  // });

  // it('works as expected when called by a fund (ERC20 to ERC20)', async () => {
  // const {
  // deployment: {
  // uniswapV2Adapter,
  // integrationManager,
  // tokens: { mln: tokenA, dai: tokenB },
  // },
  // fund: { comptrollerProxy, fundOwner, vaultProxy },
  // } = await provider.snapshot(snapshot);

  // const outgoingAssetAmount = utils.parseEther('1');
  // const minIncomingAssetAmount = utils.parseEther('1');

  // await assertUniswapV2TakeOrder({
  // comptrollerProxy,
  // vaultProxy,
  // integrationManager,
  // fundOwner,
  // uniswapV2Adapter,
  // path: [tokenA, tokenB],
  // outgoingAssetAmount,
  // minIncomingAssetAmount,
  // });
  // });

  // it('reverts if the incoming asset amount is too low', async () => {
  // const {
  // deployment: {
  // uniswapV2Adapter,
  // integrationManager,
  // tokens: { mln: tokenA, weth: tokenB },
  // },
  // fund: { comptrollerProxy, fundOwner, vaultProxy },
  // } = await provider.snapshot(snapshot);

  // const badTakeOrderTx = uniswapV2TakeOrder({
  // comptrollerProxy,
  // vaultProxy,
  // integrationManager,
  // fundOwner,
  // uniswapV2Adapter,
  // path: [tokenA, tokenB],
  // outgoingAssetAmount: utils.parseEther('1'),
  // minIncomingAssetAmount: utils.parseEther('1.0001'),
  // seedFund: true,
  // });
  // await expect(badTakeOrderTx).rejects.toBeRevertedWith(
  // 'received incoming asset less than expected',
  // );
  // });
});
