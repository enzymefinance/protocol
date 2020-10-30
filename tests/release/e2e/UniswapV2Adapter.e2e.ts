// TODO: need to review these tests

import { BigNumber, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  resolveAddress,
} from '@crestproject/crestproject';
import {
  createNewFund,
  getAssetBalances,
  uniswapV2Lend,
  uniswapV2Redeem,
  uniswapV2TakeOrder,
  defaultForkDeployment,
} from '@melonproject/testutils';
import { IUniswapV2Router2, StandardToken } from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await provider.snapshot(
    defaultForkDeployment,
  );

  const [fundOwner, ...remainingAccounts] = accounts;
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: config.tokens.weth,
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

describe('lend', () => {
  it('works as expected', async () => {
    const {
      config: {
        derivatives: {
          uniswapV2: { mlnWeth: incomingAsset },
        },
        tokens: { mln: tokenA, weth: tokenB },
      },
      deployment: { uniswapV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const incomingAssetContract = new StandardToken(
      await resolveAddress(incomingAsset),
      provider,
    );
    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = BigNumber.from(1);
    const amountBMin = BigNumber.from(1);
    const minIncomingAssetAmount = BigNumber.from(1);

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
      minIncomingAssetAmount,
      seedFund: true,
    });

    await expect(lendTx).resolves.toBeReceipt();

    const [postTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAssetContract],
    });

    expect(postTxIncomingAssetBalance).not.toEqBigNumber(BigNumber.from(0));
  });
});

describe('redeem', () => {
  it('works as expected', async () => {
    const {
      config: {
        derivatives: {
          uniswapV2: { kncWeth: outgoingAsset },
        },
        tokens: { knc: tokenA, weth: tokenB },
      },
      deployment: { uniswapV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // lend

    const outgoingAssetContract = new StandardToken(
      await resolveAddress(outgoingAsset),
      provider,
    );

    const incomingAsset = outgoingAsset;
    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = BigNumber.from(1);
    const amountBMin = BigNumber.from(1);
    const minIncomingAssetAmount = BigNumber.from(1);

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
      minIncomingAssetAmount,
      seedFund: true,
    });

    await expect(lendTx).resolves.toBeReceipt();

    // redeem

    const [outgoingAssetAmount] = await getAssetBalances({
      account: vaultProxy,
      assets: [outgoingAssetContract],
    });
    expect(outgoingAssetAmount).not.toEqBigNumber(BigNumber.from(0));

    const redeemTx = uniswapV2Redeem({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      outgoingAsset: outgoingAsset,
      liquidity: outgoingAssetAmount,
      tokenA,
      tokenB,
      amountAMin: BigNumber.from(1),
      amountBMin: BigNumber.from(1),
    });

    await expect(redeemTx).resolves.toBeReceipt();

    const [postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [outgoingAssetContract],
    });

    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });
});

describe('takeOrder', () => {
  it('Swap MLN for WETH directly', async () => {
    const {
      config: {
        integratees: {
          uniswapV2: { router },
        },
        tokens: { mln: outgoingAsset, weth: incomingAsset },
      },
      deployment: { uniswapV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const path = [outgoingAsset, incomingAsset];
    const outgoingAssetAmount = utils.parseEther('0.1');
    const routerContract = new IUniswapV2Router2(
      await resolveAddress(router),
      provider,
    );
    const amountsOut = await routerContract.getAmountsOut(
      outgoingAssetAmount,
      path,
    );

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    const takeOrderTx = uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      path,
      outgoingAssetAmount,
      minIncomingAssetAmount: amountsOut[1],
      seedFund: true,
    });

    await expect(takeOrderTx).resolves.toBeReceipt();

    const [
      postTxIncomingAssetBalance,
      postTxOutgoingAssetBalance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(
      preTxIncomingAssetBalance,
    );

    expect(incomingAssetAmount).toBeGteBigNumber(amountsOut[1]);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });

  it('Swap MLN for KNC indirectly via WETH', async () => {
    const {
      config: {
        integratees: {
          uniswapV2: { router },
        },
        tokens: { mln: outgoingAsset, knc: incomingAsset, weth },
      },
      deployment: { uniswapV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const path = [outgoingAsset, weth, incomingAsset];
    const outgoingAssetAmount = utils.parseEther('0.1');
    const routerContract = new IUniswapV2Router2(
      await resolveAddress(router),
      provider,
    );
    const amountsOut = await routerContract.getAmountsOut(
      outgoingAssetAmount,
      path,
    );

    const [preTxIncomingAssetBalance] = await getAssetBalances({
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
      minIncomingAssetAmount: amountsOut[1],
      seedFund: true,
    });

    await expect(takeOrderTx).resolves.toBeReceipt();

    const [
      postTxIncomingAssetBalance,
      postTxOutgoingAssetBalance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(
      preTxIncomingAssetBalance,
    );

    expect(incomingAssetAmount).toBeGteBigNumber(amountsOut[1]);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });
});
