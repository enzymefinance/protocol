import { assetDataUtils } from '@0x/order-utils';
import * as web3Utils from 'web3-utils';
import { createQuantity, ensureSameToken } from '@melonproject/token-math';
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
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { isValidSignature } from '~/contracts/exchanges/third-party/0x/calls/isValidSignature';
import { ensure } from '~/utils/guards/ensure';
import { ensureTakePermitted } from '../guards/ensureTakePermitted';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { getHub } from '../../hub/calls/getHub';
import { getRoutes } from '../../hub/calls/getRoutes';

const guard: GuardFunction<FillOrderArgs> = async (
  environment,
  { signedOrder, takerQuantity: providedTakerQuantity },
  contractAddress,
) => {
  const hubAddress = await getHub(environment, contractAddress);
  const { vaultAddress } = await getRoutes(environment, hubAddress);
  const zeroExAddress =
    environment.deployment.exchangeConfigs[Exchanges.ZeroEx].exchange;

  const validSignature = await isValidSignature(environment, zeroExAddress, {
    signedOrder,
  });

  ensure(validSignature, 'Signature invalid');

  const takerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.takerAssetData,
  ).tokenAddress;

  const takerToken = await getToken(environment, takerTokenAddress);

  const makerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.makerAssetData,
  ).tokenAddress;

  const makerToken = await getToken(environment, makerTokenAddress);

  const fillTakerQuantity =
    providedTakerQuantity ||
    createQuantity(takerToken, signedOrder.takerAssetAmount.toString());

  const makerQuantity = createQuantity(
    makerToken,
    signedOrder.makerAssetAmount.toString(),
  );
  const takerQuantity = createQuantity(
    takerToken,
    signedOrder.takerAssetAmount.toString(),
  );

  await ensureSameToken(fillTakerQuantity.token, takerQuantity.token);
  await ensureSufficientBalance(environment, fillTakerQuantity, vaultAddress);

  await ensureTakePermitted(
    environment,
    contractAddress,
    Exchanges.KyberNetwork,
    makerQuantity,
    takerQuantity,
    fillTakerQuantity,
  );
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

  try {
    const args = [
      exchangeIndex,
      FunctionSignatures.takeOrder,
      [
        signedOrder.makerAddress.toString(),
        emptyAddress /*contractAddress.toString() */,
        makerTokenAddress,
        takerTokenAddress,
        signedOrder.feeRecipientAddress,
        emptyAddress,
      ],
      [
        signedOrder.makerAssetAmount.toString(),
        signedOrder.takerAssetAmount.toString(),
        signedOrder.makerFee.toString(),
        signedOrder.takerFee.toString(),
        signedOrder.expirationTimeSeconds.toString(),
        signedOrder.salt.toString(),
        takerQuantity.quantity.toString(),
        0,
      ],
      web3Utils.padLeft('0x0', 64),
      signedOrder.makerAssetData,
      signedOrder.takerAssetData,
      signedOrder.signature,
    ];

    return args;
  } catch (e) {
    console.error(e);
    throw e;
  }
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
