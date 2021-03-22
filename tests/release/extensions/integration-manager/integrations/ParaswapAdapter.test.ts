import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  paraswapTakeOrderArgs,
  SpendAssetsHandleType,
  takeOrderSelector,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  getAssetBalances,
  paraswapGenerateMockPaths,
  paraswapTakeOrder,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

const payload = `0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000006b175474e89094c44da98b954eedeac495271d0f`;

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
      deployment: { integrationManager, paraSwapAdapter },
      config: {
        paraswap: { augustusSwapper, tokenTransferProxy },
      },
    } = await provider.snapshot(snapshot);

    const exchangeResult = await paraSwapAdapter.getExchange();
    expect(exchangeResult).toMatchAddress(augustusSwapper);

    const integrationManagerResult = await paraSwapAdapter.getIntegrationManager();
    expect(integrationManagerResult).toMatchAddress(integrationManager);

    const tokenTransferProxyResult = await paraSwapAdapter.getTokenTransferProxy();
    expect(tokenTransferProxyResult).toMatchAddress(tokenTransferProxy);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { paraSwapAdapter },
    } = await provider.snapshot(snapshot);

    const args = paraswapTakeOrderArgs({
      incomingAsset: randomAddress(),
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
      expectedIncomingAssetAmount: 1,
      paths: paraswapGenerateMockPaths(),
    });

    await expect(paraSwapAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(paraSwapAdapter.parseAssetsForMethod(takeOrderSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output (no fees)', async () => {
    const {
      deployment: { paraSwapAdapter },
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

    const result = await paraSwapAdapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraSwapAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });

  it('generates expected output (with fees and non-WETH outgoingAsset)', async () => {
    const {
      config: { weth: feeAsset },
      deployment: { paraSwapAdapter },
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

    const result = await paraSwapAdapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraSwapAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset, feeAsset],
      spendAssetAmounts_: [outgoingAssetAmount, totalNetworkFee],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });

  it('generates expected output (with fees and fee asset as outgoingAsset)', async () => {
    const {
      config: { weth: feeAsset },
      deployment: { paraSwapAdapter },
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

    const result = await paraSwapAdapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraSwapAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount.add(totalNetworkFee)],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { paraSwapAdapter },
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
      adapter: paraSwapAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(paraSwapAdapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected (no fee)', async () => {
    const {
      config: {
        weth,
        primitives: { dai },
      },
      deployment: { paraSwapAdapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(weth, whales.weth);
    const incomingAsset = new StandardToken(dai, provider);

    // Define the Paraswap Paths
    // Data taken directly from API: https://paraswapv2.docs.apiary.io/
    // `payload` is hardcoded from the API call
    const paths = [
      {
        to: incomingAsset.address, // dest token or intermediary (i.e., dai)
        totalNetworkFee: 0,
        routes: [
          {
            exchange: '0x3b4503CBA9ADd1194Dd8098440e4Be91c4C37806', // Paraswap's UniswapV2 adapter
            targetExchange: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap Router2
            percent: 10000, // Out of 10000
            payload,
            networkFee: 0,
          },
        ],
      },
    ];

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
      paraswapAdapter: paraSwapAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: '1',
      paths,
    });

    // Get the balances of incoming and outgoing assets post-trade
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    expect(postTxIncomingAssetBalance).toBeGtBigNumber(0);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAssetAmount));

    // Assert the correct event was fired
    assertEvent(receipt, integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund'), {
      comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      adapter: paraSwapAdapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance)],
      outgoingAssets: [outgoingAsset],
      outgoingAssetAmounts: [outgoingAssetAmount],
      integrationData: expect.anything(),
    });
  });

  xit('works as expected (with fee, outgoingAsset is not fee asset)', async () => {
    const {
      config: {
        weth,
        primitives: { dai, mln },
      },
      deployment: { paraSwapAdapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(dai, whales.dai);
    const incomingAsset = new StandardToken(mln, provider);
    const feeAsset = new StandardToken(weth, whales.weth);

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
      paraswapAdapter: paraSwapAdapter,
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
      adapter: paraSwapAdapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: [outgoingAsset, feeAsset],
      outgoingAssetAmounts: [outgoingAssetAmount, feeAmount],
      integrationData: expect.anything(),
    });
  });

  xit('works as expected (with fee, outgoingAsset is fee asset)', async () => {
    const {
      config: {
        weth,
        primitives: { mln },
      },
      deployment: { paraSwapAdapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(weth, whales.weth);
    const incomingAsset = new StandardToken(mln, provider);

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
      paraswapAdapter: paraSwapAdapter,
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
      adapter: paraSwapAdapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: [outgoingAsset],
      outgoingAssetAmounts: [expectedOutgoingAssetAmount],
      integrationData: expect.anything(),
    });
  });
});
