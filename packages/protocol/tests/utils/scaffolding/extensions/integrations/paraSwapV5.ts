import type { AddressLike } from '@enzymefinance/ethers';
import { resolveAddress } from '@enzymefinance/ethers';
import type {
  ComptrollerLib,
  IntegrationManager,
  ITestStandardToken,
  ParaSwapV5Adapter,
  ParaSwapV5SwapType,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  encodeArgs,
  IntegrationManagerActionId,
  ITestUniswapV2Pair,
  ONE_HUNDRED_PERCENT_IN_BPS,
  paraSwapV5TakeMultipleOrdersArgs,
  paraSwapV5TakeOrderArgs,
  takeMultipleOrdersSelector,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, constants, utils } from 'ethers';

export interface ParaSwapV5OrderParams {
  outgoingAsset: ITestStandardToken;
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount?: BigNumberish;
  expectedIncomingAssetAmount?: BigNumberish;
  uuid?: BytesLike;
  swapType: ParaSwapV5SwapType;
  swapData: BytesLike;
}

const paraSwapV5UniV2ForkAdapterAddress = '0x3A0430bF7cd2633af111ce3204DB4b0990857a6F';
const paraSwapV5UniV2ForkIndex = 4;

// ParaSwapV5Path
export function paraSwapV5GenerateDummyPaths({ toTokens }: { toTokens: AddressLike[] }) {
  return toTokens.map((toToken) => {
    return {
      // Not supported in our protocol
      adapters: [],
      to: toToken,
      totalNetworkFee: 0, // Can ignore this param in the dummy
    };
  });
}

export async function paraSwapV5TakeMultipleOrders({
  comptrollerProxy,
  integrationManager,
  signer,
  paraSwapV5Adapter,
  orders,
  allowOrdersToFail,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  paraSwapV5Adapter: ParaSwapV5Adapter;
  orders: ParaSwapV5OrderParams[];
  allowOrdersToFail: boolean;
}) {
  const ordersData = orders.map((order) =>
    paraSwapV5TakeOrderArgs({
      expectedIncomingAssetAmount: order.expectedIncomingAssetAmount ? order.expectedIncomingAssetAmount : 1,
      minIncomingAssetAmount: order.minIncomingAssetAmount ? order.minIncomingAssetAmount : 1,
      outgoingAsset: order.outgoingAsset,
      outgoingAssetAmount: order.outgoingAssetAmount,
      swapData: order.swapData,
      swapType: order.swapType,
      uuid: order.uuid ? order.uuid : utils.randomBytes(16),
    }),
  );

  const takeMultipleOrdersArgs = paraSwapV5TakeMultipleOrdersArgs({
    ordersData,
    allowOrdersToFail,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: paraSwapV5Adapter,
    encodedCallArgs: takeMultipleOrdersArgs,
    selector: takeMultipleOrdersSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function paraSwapV5TakeOrder({
  comptrollerProxy,
  integrationManager,
  signer,
  paraSwapV5Adapter,
  outgoingAsset,
  outgoingAssetAmount,
  minIncomingAssetAmount = 1,
  expectedIncomingAssetAmount = minIncomingAssetAmount,
  uuid = utils.randomBytes(16),
  swapType,
  swapData,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  paraSwapV5Adapter: ParaSwapV5Adapter;
  outgoingAsset: ITestStandardToken;
  outgoingAssetAmount: BigNumberish;
  minIncomingAssetAmount?: BigNumberish;
  expectedIncomingAssetAmount?: BigNumberish;
  uuid?: BytesLike;
  swapType: ParaSwapV5SwapType;
  swapData: BytesLike;
}) {
  const takeOrderArgs = paraSwapV5TakeOrderArgs({
    expectedIncomingAssetAmount,
    minIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
    uuid,
    swapType,
    swapData,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: paraSwapV5Adapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

// Helpers

export function paraSwapV5ConstructUniV2ForkPaths({
  incomingAsset,
  payloads,
  percents,
}: {
  incomingAsset: AddressLike;
  payloads: BytesLike[];
  percents: BigNumberish[];
}) {
  return [
    {
      adapters: [
        {
          adapter: paraSwapV5UniV2ForkAdapterAddress,
          networkFee: 0,
          percent: ONE_HUNDRED_PERCENT_IN_BPS,
          route: payloads.map((payload, i) => {
            return {
              index: paraSwapV5UniV2ForkIndex,
              networkFee: 0,
              payload,
              percent: percents[i],
              // Unused
              targetExchange: constants.AddressZero,
            };
          }),
        },
      ],
      to: resolveAddress(incomingAsset),
      totalNetworkFee: 0,
    },
  ];
}

export async function paraSwapV5ConstructUniV2ForkPayload({
  provider,
  pool,
  incomingAsset,
}: {
  provider: EthereumTestnetProvider;
  pool: AddressLike;
  incomingAsset: AddressLike;
}) {
  // Construct the payload for UniswapV2 forks in the same way
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

  const shiftedFee = BigNumber.from(30).shl(161);
  const uniV2Pool = new ITestUniswapV2Pair(pool, provider);
  const uniV2ShiftedDirection =
    (await uniV2Pool.token0()) === resolveAddress(incomingAsset) ? BigNumber.from(1).shl(160) : 0;
  const uniV2PackedPool = shiftedFee.add(uniV2ShiftedDirection).add(uniV2Pool.address);

  return encodeArgs(
    [uniswapV2DataStruct],
    [
      {
        pools: [uniV2PackedPool],
        weth: constants.AddressZero,
      },
    ],
  );
}
