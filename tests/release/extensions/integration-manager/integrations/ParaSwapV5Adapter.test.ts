import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  encodeArgs,
  IUniswapV2Pair,
  ONE_HUNDRED_PERCENT_IN_BPS,
  paraSwapV5TakeOrderArgs,
  SpendAssetsHandleType,
  StandardToken,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  paraSwapV5GenerateDummyPaths,
  paraSwapV5TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const paraSwapV5Adapter = fork.deployment.paraSwapV5Adapter;

    // AdapterBase
    const integrationManagerResult = await paraSwapV5Adapter.getIntegrationManager();
    expect(integrationManagerResult).toMatchAddress(fork.deployment.integrationManager);

    // ParaSwapV5ActionsMixin
    expect(await paraSwapV5Adapter.getParaSwapV5AugustusSwapper()).toMatchAddress(
      fork.config.paraSwapV5.augustusSwapper,
    );
    expect(await paraSwapV5Adapter.getParaSwapV5TokenTransferProxy()).toMatchAddress(
      fork.config.paraSwapV5.tokenTransferProxy,
    );
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const paraSwapV5Adapter = fork.deployment.paraSwapV5Adapter;

    const args = paraSwapV5TakeOrderArgs({
      expectedIncomingAssetAmount: 123,
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
      paths: paraSwapV5GenerateDummyPaths({ toTokens: [randomAddress()] }),
      uuid: utils.randomBytes(16),
    });

    await expect(
      paraSwapV5Adapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(
      paraSwapV5Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, args),
    ).resolves.toBeTruthy();
  });

  it('generates expected output', async () => {
    const paraSwapV5Adapter = fork.deployment.paraSwapV5Adapter;

    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = paraSwapV5TakeOrderArgs({
      expectedIncomingAssetAmount: 123,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
      paths: paraSwapV5GenerateDummyPaths({ toTokens: [incomingAsset] }),
      uuid: utils.randomBytes(16),
    });

    const result = await paraSwapV5Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraSwapV5Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
      spendAssetAmounts_: [outgoingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const [fundOwner] = fork.accounts;
    const paraSwapV5Adapter = fork.deployment.paraSwapV5Adapter;

    const { vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    const takeOrderArgs = paraSwapV5TakeOrderArgs({
      expectedIncomingAssetAmount: 1,
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
      paths: paraSwapV5GenerateDummyPaths({ toTokens: [randomAddress()] }),
      uuid: utils.randomBytes(16),
    });

    const transferArgs = await assetTransferArgs({
      adapter: paraSwapV5Adapter,
      encodedCallArgs: takeOrderArgs,
      selector: takeOrderSelector,
    });

    await expect(paraSwapV5Adapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund (no network fees)', async () => {
    const outgoingAsset = new StandardToken(fork.config.weth, whales.weth);
    const incomingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const [fundOwner] = fork.accounts;
    const paraSwapV5Adapter = fork.deployment.paraSwapV5Adapter;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const outgoingAssetAmount = utils.parseEther('1');
    const minIncomingAssetAmount = '1';

    // UniV2 and Sushi have the same adapter and index, and same fee
    const adapter = '0x3A0430bF7cd2633af111ce3204DB4b0990857a6F';
    const index = 4;
    const shiftedFee = BigNumber.from(30).shl(161);
    const fiftyPercent = BigNumber.from(ONE_HUNDRED_PERCENT_IN_BPS).div(2);

    // Construct the payload for both UniswapV2 forks in the same way
    // struct UniswapV2Data {
    //   address weth;
    //   uint256[] pools;
    // }
    const uniswapV2DataStruct = utils.ParamType.fromString('tuple(address weth, uint256[] pools)');

    // Construct each `pools` value by packing a BN so that:
    // pool address = bits 1-159
    // direction (`1` if the incoming token is `token0` on the pool) = bit 160
    // fee (`30` for all Uni forks) = bits 161+
    // e.g., hex((30 << 161) + (1 << 160) + 0xa478c2975ab1ea89e8196811f51a7b7ade33eb11)

    // UniV2 payload
    const uniV2Pool = new IUniswapV2Pair(fork.config.uniswap.pools.daiWeth, provider);
    const uniV2ShiftedDirection = (await uniV2Pool.token0()) == incomingAsset.address ? BigNumber.from(1).shl(160) : 0;
    const uniV2PackedPool = shiftedFee.add(uniV2ShiftedDirection).add(uniV2Pool.address);
    const uniV2Payload = encodeArgs([uniswapV2DataStruct], [{ pools: [uniV2PackedPool], weth: constants.AddressZero }]);

    // Sushi payload
    const sushiPool = new IUniswapV2Pair('0xc3d03e4f041fd4cd388c549ee2a29a9e5075882f', provider);
    const sushiShiftedDirection = (await sushiPool.token0()) == incomingAsset.address ? BigNumber.from(1).shl(160) : 0;
    const sushiPackedPool = shiftedFee.add(sushiShiftedDirection).add(sushiPool.address);
    const sushiPayload = encodeArgs([uniswapV2DataStruct], [{ pools: [sushiPackedPool], weth: constants.AddressZero }]);

    // Define the ParaSwap Paths
    const paths = [
      {
        adapters: [
          {
            adapter,
            networkFee: 0,
            percent: ONE_HUNDRED_PERCENT_IN_BPS,
            route: [
              // UniswapV2
              {
                index,
                networkFee: 0,
                payload: uniV2Payload,
                percent: fiftyPercent,
                // Unused
                targetExchange: constants.AddressZero,
              },
              // Sushi
              {
                index,
                networkFee: 0,
                payload: sushiPayload,
                percent: fiftyPercent,
                // Unused
                targetExchange: constants.AddressZero,
              },
            ],
          },
        ],
        to: incomingAsset.address,
        // dest token or intermediary (i.e., dai)
        totalNetworkFee: 0,
      },
    ];

    // Seed fund with more than what will be spent
    const initialOutgoingAssetBalance = outgoingAssetAmount.mul(2);
    await outgoingAsset.transfer(vaultProxy, initialOutgoingAssetBalance);

    // TODO: can call multiSwap() first to get the expected amount

    // Trade on ParaSwap
    await paraSwapV5TakeOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
      paraSwapV5Adapter,
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
