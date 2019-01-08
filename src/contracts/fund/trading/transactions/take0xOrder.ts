import { assetDataUtils } from '@0x/order-utils';
import * as web3Utils from 'web3-utils';
import { createQuantity } from '@melonproject/token-math/quantity';
import {
  GuardFunction,
  PrepareArgsFunction,
  PostProcessFunction,
  transactionFactory,
} from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { Contracts, Exchanges } from '~/Contracts';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import {
  FillOrderArgs,
  FillOrderResult,
  parse0xFillReceipt,
} from '~/contracts/exchanges/third-party/0x/transactions/fillOrder';
import { getFeeToken } from '~/contracts/exchanges/third-party/0x/calls/getFeeToken';

export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

const guard: GuardFunction<FillOrderArgs> = async () => {
  /* TODO:
  - [ ] Check if takerQuantity is the token in signedOrder
  - [ ] Check policy (policyManager.methods.preValidate)

  See: makeOasisDexOrder.ts
  */
};

const prepareArgs: PrepareArgsFunction<FillOrderArgs> = async (
  environment,
  { signedOrder, takerQuantity: providedTakerQuantity },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.ZeroEx,
  });

  const makerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.makerAssetData,
  ).tokenAddress;
  const takerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.takerAssetData,
  ).tokenAddress;

  const takerToken = await getToken(environment, takerTokenAddress);

  const takerQuantity =
    providedTakerQuantity ||
    createQuantity(takerToken, signedOrder.takerAssetAmount.toString());

  const args = [
    exchangeIndex,
    FunctionSignatures.takeOrder,
    [
      signedOrder.makerAddress.toString(),
      NULL_ADDRESS /*contractAddress.toString() */,
      makerTokenAddress,
      takerTokenAddress,
      signedOrder.feeRecipientAddress,
      NULL_ADDRESS,
    ],
    [
      signedOrder.makerAssetAmount.toFixed(),
      signedOrder.takerAssetAmount.toFixed(),
      signedOrder.makerFee.toFixed(),
      signedOrder.takerFee.toFixed(),
      signedOrder.expirationTimeSeconds.toFixed(),
      signedOrder.salt.toFixed(),
      takerQuantity.quantity.toString(),
      0,
    ],
    web3Utils.padLeft('0x0', 64),
    signedOrder.makerAssetData,
    signedOrder.takerAssetData,
    signedOrder.signature,
  ];

  return args;
};

const postProcess: PostProcessFunction<FillOrderArgs, FillOrderResult> = async (
  environment,
  receipt,
) => {
  const zeroExAddress =
    environment.deployment.exchangeConfigs[Exchanges.ZeroEx].exchange;

  const feeToken = await getFeeToken(environment, zeroExAddress);
  const fillValues = receipt.events.Fill.returnValues;

  const result = await parse0xFillReceipt(environment, {
    feeToken,
    fillValues,
  });

  return result;
};

const take0xOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
);

export { take0xOrder };
