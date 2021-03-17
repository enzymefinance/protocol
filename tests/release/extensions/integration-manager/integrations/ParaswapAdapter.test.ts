import { randomAddress } from '@enzymefinance/ethers';
import { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import {
  assetTransferArgs,
  paraswapTakeOrderArgs,
  SpendAssetsHandleType,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  defaultTestDeployment,
  getAssetBalances,
  paraswapGenerateMockPaths,
  paraswapTakeOrder,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

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

xdescribe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { integrationManager, paraswapAdapter },
      config: {
        integratees: {
          paraswap: { augustusSwapper, tokenTransferProxy },
        },
      },
    } = await provider.snapshot(snapshot);

    const exchangeResult = await paraswapAdapter.getExchange();
    expect(exchangeResult).toMatchAddress(augustusSwapper);

    const integrationManagerResult = await paraswapAdapter.getIntegrationManager();
    expect(integrationManagerResult).toMatchAddress(integrationManager);

    const tokenTransferProxyResult = await paraswapAdapter.getTokenTransferProxy();
    expect(tokenTransferProxyResult).toMatchAddress(tokenTransferProxy);
  });
});

xdescribe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { paraswapAdapter },
    } = await provider.snapshot(snapshot);

    const args = paraswapTakeOrderArgs({
      incomingAsset: randomAddress(),
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
      expectedIncomingAssetAmount: 1,
      paths: paraswapGenerateMockPaths(),
    });

    await expect(paraswapAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(paraswapAdapter.parseAssetsForMethod(takeOrderSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output (no fees)', async () => {
    const {
      deployment: { paraswapAdapter },
    } = await provider.snapshot(snapshot);

    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = paraswapTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
      expectedIncomingAssetAmount: 1,
      paths: paraswapGenerateMockPaths(),
    });

    const result = await paraswapAdapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraswapAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });

  it('generates expected output (with fees and non-WETH outgoingAsset)', async () => {
    const {
      deployment: {
        paraswapAdapter,
        tokens: { weth: feeAsset },
      },
    } = await provider.snapshot(snapshot);

    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('1');

    const networkFee1 = utils.parseEther('1');
    const networkFee2 = utils.parseEther('2');
    const totalNetworkFee = networkFee1.add(networkFee2);

    const takeOrderArgs = paraswapTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
      expectedIncomingAssetAmount: 1,
      paths: paraswapGenerateMockPaths([networkFee1, networkFee2]),
    });

    const result = await paraswapAdapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraswapAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset, feeAsset],
      spendAssetAmounts_: [outgoingAssetAmount, totalNetworkFee],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });

  it('generates expected output (with fees and fee asset as outgoingAsset)', async () => {
    const {
      deployment: {
        paraswapAdapter,
        tokens: { weth: feeAsset },
      },
    } = await provider.snapshot(snapshot);

    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = feeAsset;
    const outgoingAssetAmount = utils.parseEther('1');

    const networkFee1 = utils.parseEther('1');
    const networkFee2 = utils.parseEther('2');
    const totalNetworkFee = networkFee1.add(networkFee2);

    const takeOrderArgs = paraswapTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
      expectedIncomingAssetAmount: 1,
      paths: paraswapGenerateMockPaths([networkFee1, networkFee2]),
    });

    const result = await paraswapAdapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraswapAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount.add(totalNetworkFee)],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });
});

xdescribe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { paraswapAdapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const takeOrderArgs = paraswapTakeOrderArgs({
      incomingAsset: randomAddress(),
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
      expectedIncomingAssetAmount: 1,
      paths: paraswapGenerateMockPaths(),
    });

    const transferArgs = await assetTransferArgs({
      adapter: paraswapAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(paraswapAdapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected (no fee)', async () => {
    const {
      deployment: {
        paraswapAdapter,
        tokens: { weth: outgoingAsset, mln: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Seed the fund with outgoingAsset
    const outgoingAssetAmount = utils.parseEther('1');
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

    // Get the balances of incoming and outgoing assets pre-trade
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Trade on Paraswap
    const receipt = await paraswapTakeOrder({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      paraswapAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: 1,
      paths: paraswapGenerateMockPaths(),
    });

    // Get the balances of incoming and outgoing assets post-trade
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Assert the expected final token balances against what was expected
    // Incoming and outgoing asset amounts are the same as long as the rate remains 1:1
    const expectedIncomingAssetAmount = outgoingAssetAmount;
    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedIncomingAssetAmount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAssetAmount));

    // Assert the correct event was fired
    assertEvent(receipt, integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund'), {
      comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      adapter: paraswapAdapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: [outgoingAsset],
      outgoingAssetAmounts: [outgoingAssetAmount],
      integrationData: expect.anything(),
    });
  });

  it('works as expected (with fee, outgoingAsset is not fee asset)', async () => {
    const {
      deployment: {
        paraswapAdapter,
        tokens: { weth: feeAsset, dai: outgoingAsset, mln: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Seed the fund with outgoingAsset and feeAsset
    const outgoingAssetAmount = utils.parseEther('1');
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
    const feeAmount = utils.parseEther('1');
    await feeAsset.transfer(vaultProxy, feeAmount);

    // Get the balances of incoming, outgoing, and fee assets pre-trade
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance, preTxFeeAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset, feeAsset],
    });

    // Trade on Paraswap
    const receipt = await paraswapTakeOrder({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      paraswapAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: 1,
      paths: paraswapGenerateMockPaths([feeAmount]),
    });

    // Get the balances of incoming, outgoing, and fee assets post-trade
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance, postTxFeeAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset, feeAsset],
    });

    // Assert the expected final token balances against what was expected
    // Incoming and outgoing asset amounts are the same as long as the rate remains 1:1
    const expectedIncomingAssetAmount = outgoingAssetAmount;
    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedIncomingAssetAmount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAssetAmount));
    expect(postTxFeeAssetBalance).toEqBigNumber(preTxFeeAssetBalance.sub(feeAmount));

    // Assert the correct event was fired
    assertEvent(receipt, integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund'), {
      comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      adapter: paraswapAdapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: [outgoingAsset, feeAsset],
      outgoingAssetAmounts: [outgoingAssetAmount, feeAmount],
      integrationData: expect.anything(),
    });
  });

  it('works as expected (with fee, outgoingAsset is fee asset)', async () => {
    const {
      deployment: {
        paraswapAdapter,
        tokens: { weth: outgoingAsset, mln: incomingAsset },
        integrationManager,
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Seed the fund with outgoingAsset and feeAsset
    const outgoingAssetAmount = utils.parseEther('1');
    const feeAmount = utils.parseEther('1');
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount.add(feeAmount));

    // Get the balances of incoming and outgoing assets pre-trade
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Trade on Paraswap
    const receipt = await paraswapTakeOrder({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      paraswapAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: 1,
      paths: paraswapGenerateMockPaths([feeAmount]),
    });

    // Get the balances of incoming and outgoing assets post-trade
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Assert the expected final token balances against what was expected
    const expectedOutgoingAssetAmount = outgoingAssetAmount.add(feeAmount);
    // Incoming and outgoing asset amounts are the same as long as the rate remains 1:1
    const expectedIncomingAssetAmount = outgoingAssetAmount;
    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedIncomingAssetAmount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(expectedOutgoingAssetAmount));

    // Assert the correct event was fired
    assertEvent(receipt, integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund'), {
      comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      adapter: paraswapAdapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: [outgoingAsset],
      outgoingAssetAmounts: [expectedOutgoingAssetAmount],
      integrationData: expect.anything(),
    });
  });
});
