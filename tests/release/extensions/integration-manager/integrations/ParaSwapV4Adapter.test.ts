import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  paraSwapV4TakeOrderArgs,
  SpendAssetsHandleType,
  takeOrderSelector,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  getAssetBalances,
  paraSwapV4GenerateDummyPaths,
  paraSwapV4TakeOrder,
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
      deployment: { integrationManager, paraSwapV4Adapter },
      config: {
        paraSwapV4: { augustusSwapper, tokenTransferProxy },
      },
    } = await provider.snapshot(snapshot);

    // AdapterBase2
    const integrationManagerResult = await paraSwapV4Adapter.getIntegrationManager();
    expect(integrationManagerResult).toMatchAddress(integrationManager);

    // ParaSwapV4ActionsMixin
    expect(await paraSwapV4Adapter.getParaSwapV4AugustusSwapper()).toMatchAddress(augustusSwapper);
    expect(await paraSwapV4Adapter.getParaSwapV4TokenTransferProxy()).toMatchAddress(tokenTransferProxy);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { paraSwapV4Adapter },
    } = await provider.snapshot(snapshot);

    const args = paraSwapV4TakeOrderArgs({
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
      expectedIncomingAssetAmount: 1,
      paths: paraSwapV4GenerateDummyPaths({ toTokens: [randomAddress()] }),
    });

    await expect(paraSwapV4Adapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(paraSwapV4Adapter.parseAssetsForMethod(takeOrderSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output', async () => {
    const {
      deployment: { paraSwapV4Adapter },
    } = await provider.snapshot(snapshot);

    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = paraSwapV4TakeOrderArgs({
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
      expectedIncomingAssetAmount: 1,
      paths: paraSwapV4GenerateDummyPaths({ toTokens: [incomingAsset] }),
    });

    const result = await paraSwapV4Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraSwapV4Adapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { paraSwapV4Adapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const takeOrderArgs = paraSwapV4TakeOrderArgs({
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
      expectedIncomingAssetAmount: 1,
      paths: paraSwapV4GenerateDummyPaths({ toTokens: [randomAddress()] }),
    });

    const transferArgs = await assetTransferArgs({
      adapter: paraSwapV4Adapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(paraSwapV4Adapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  // Will not work until bumping the mainnet fork block
  xit('works as expected', async () => {
    const {
      config: {
        weth,
        primitives: { dai },
      },
      deployment: { paraSwapV4Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const outgoingAsset = new StandardToken(weth, whales.weth);
    const incomingAsset = new StandardToken(dai, provider);

    // Define the ParaSwap Paths
    // Data taken directly from API: https://paraswapv2.docs.apiary.io/
    // `payload` is hardcoded from the API call
    const paths = [
      {
        to: incomingAsset.address, // dest token or intermediary (i.e., dai)
        totalNetworkFee: 0,
        routes: [
          {
            exchange: '0x695725627E04898Ef4a126Ae71FC30aA935c5fb6', // ParaSwap's UniswapV2 adapter
            targetExchange: '0x86d3579b043585A97532514016dCF0C2d6C4b6a1', // Uniswap Router2
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

    // Trade on ParaSwap
    const receipt = await paraSwapV4TakeOrder({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      paraSwapV4Adapter: paraSwapV4Adapter,
      outgoingAsset,
      outgoingAssetAmount,
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
      adapter: paraSwapV4Adapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance)],
      outgoingAssets: [outgoingAsset],
      outgoingAssetAmounts: [outgoingAssetAmount],
      integrationData: expect.anything(),
    });
  });
});
