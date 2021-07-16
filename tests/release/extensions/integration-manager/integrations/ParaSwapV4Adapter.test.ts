import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  paraSwapV4TakeOrderArgs,
  SpendAssetsHandleType,
  takeOrderSelector,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  ProtocolDeployment,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  paraSwapV4GenerateDummyPaths,
  paraSwapV4TakeOrder,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

const payload = `0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000006b175474e89094c44da98b954eedeac495271d0f`;

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const paraSwapV4Adapter = fork.deployment.paraSwapV4Adapter;

    // AdapterBase
    const integrationManagerResult = await paraSwapV4Adapter.getIntegrationManager();
    expect(integrationManagerResult).toMatchAddress(fork.deployment.integrationManager);

    // ParaSwapV4ActionsMixin
    expect(await paraSwapV4Adapter.getParaSwapV4AugustusSwapper()).toMatchAddress(
      fork.config.paraSwapV4.augustusSwapper,
    );
    expect(await paraSwapV4Adapter.getParaSwapV4TokenTransferProxy()).toMatchAddress(
      fork.config.paraSwapV4.tokenTransferProxy,
    );
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const paraSwapV4Adapter = fork.deployment.paraSwapV4Adapter;

    const args = paraSwapV4TakeOrderArgs({
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
      expectedIncomingAssetAmount: 1,
      paths: paraSwapV4GenerateDummyPaths({ toTokens: [randomAddress()] }),
    });

    await expect(
      paraSwapV4Adapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(
      paraSwapV4Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, args),
    ).resolves.toBeTruthy();
  });

  it('generates expected output', async () => {
    const paraSwapV4Adapter = fork.deployment.paraSwapV4Adapter;

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

    const result = await paraSwapV4Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraSwapV4Adapter.parseAssetsForAction, {
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
    const [fundOwner] = fork.accounts;
    const paraSwapV4Adapter = fork.deployment.paraSwapV4Adapter;

    const { vaultProxy } = await createNewFund({
      signer: fork.deployer,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

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

  it('works as expected when called by a fund (no network fees)', async () => {
    const outgoingAsset = new StandardToken(fork.config.weth, whales.weth);
    const incomingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const [fundOwner] = fork.accounts;
    const paraSwapV4Adapter = fork.deployment.paraSwapV4Adapter;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    const outgoingAssetAmount = utils.parseEther('1');
    const minIncomingAssetAmount = '1';

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
            percent: 5000, // Out of 10000
            payload,
            networkFee: 0,
          },
          {
            exchange: '0x77Bc1A1ba4E9A6DF5BDB21f2bBC07B9854E8D1a8', // ParaSwap's Sushiswap adapter
            targetExchange: '0xBc1315CD2671BC498fDAb42aE1214068003DC51e', // Sushiswap contract
            percent: 5000, // Out of 10000
            payload,
            networkFee: 0,
          },
        ],
      },
    ];

    // Seed fund with more than what will be spent
    const initialOutgoingAssetBalance = outgoingAssetAmount.mul(2);
    await outgoingAsset.transfer(vaultProxy, initialOutgoingAssetBalance);

    // TODO: can call multiSwap() first to get the expected amount

    // Trade on ParaSwap
    await paraSwapV4TakeOrder({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      paraSwapV4Adapter,
      outgoingAsset,
      outgoingAssetAmount,
      minIncomingAssetAmount,
      paths,
    });

    // Calculate the fund balances after the tx and assert the correct final token balances
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    expect(postTxOutgoingAssetBalance).toEqBigNumber(initialOutgoingAssetBalance.sub(outgoingAssetAmount));
    expect(postTxIncomingAssetBalance).toBeGtBigNumber(0);
  });
});
