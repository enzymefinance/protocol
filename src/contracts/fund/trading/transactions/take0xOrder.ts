import { assetDataUtils } from '0x.js';
import * as web3Utils from 'web3-utils';

import {
  transactionFactory,
  PrepareArgsFunction,
  getDeployment,
  PostProcessFunction,
} from '~/utils/solidity';
import {
  FillOrderArgs,
  parse0xFillReceipt,
  FillOrderResult,
  getFeeToken,
} from '~/contracts/exchanges';
import { Contracts } from '~/Contracts';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { getToken } from '~/contracts/dependencies/token';
import { createQuantity } from '@melonproject/token-math/quantity';

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

const prepareArgs: PrepareArgsFunction<FillOrderArgs> = async (
  { signedOrder, takerQuantity: providedTakerQuantity },
  contractAddress,
  environment,
) => {
  const deployment = await getDeployment();

  const zeroExAddress = deployment.exchangeConfigs.find(
    o => o.name === 'ZeroEx',
  ).exchangeAddress;

  const exchangeIndex = await getExchangeIndex(
    zeroExAddress,
    contractAddress,
    environment,
  );

  const makerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.makerAssetData,
  ).tokenAddress;
  const takerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.takerAssetData,
  ).tokenAddress;

  const takerToken = await getToken(takerTokenAddress, environment);

  const takerQuantity =
    providedTakerQuantity ||
    createQuantity(takerToken, signedOrder.takerAssetAmount.toString());

  const args = [
    exchangeIndex,
    'takeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
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
  receipt,
  _,
  __,
  environment,
) => {
  const deployment = await getDeployment();

  const zeroExAddress = deployment.exchangeConfigs.find(
    o => o.name === 'ZeroEx',
  ).exchangeAddress;

  const feeToken = await getFeeToken(zeroExAddress, undefined, environment);
  const fillValues = receipt.events.Fill.returnValues;

  const result = await parse0xFillReceipt(
    { fillValues, feeToken },
    environment,
  );

  return result;
};

const take0xOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  undefined,
  prepareArgs,
  postProcess,
);

export { take0xOrder };
