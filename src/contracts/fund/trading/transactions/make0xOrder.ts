import * as web3Utils from 'web3-utils';
import { assetDataUtils } from '@0x/order-utils';
import { SignedOrder } from '@0x/types';
import { createQuantity } from '@melonproject/token-math';

import { Contracts, Exchanges } from '~/Contracts';

import { getExchangeIndex } from '../calls/getExchangeIndex';
import {
  GuardFunction,
  PrepareArgsFunction,
  PostProcessFunction,
  transactionFactory,
} from '~/utils/solidity/transactionFactory';
import { getHub } from '../../hub/calls/getHub';
import { getRoutes } from '../../hub/calls/getRoutes';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { isValidSignature } from '~/contracts/exchanges/third-party/0x/calls/isValidSignature';
import { ensure } from '~/utils/guards/ensure';
import { ensureNotInOpenMakeOrder } from '../guards/ensureNotInOpenMakeOrder';

// The order needs to be signed by the manager
export interface Make0xOrderArgs {
  signedOrder: SignedOrder;
}

const guard: GuardFunction<Make0xOrderArgs> = async (
  environment,
  { signedOrder },
  contractAddress,
) => {
  const hubAddress = await getHub(environment, contractAddress);
  const { vaultAddress } = await getRoutes(environment, hubAddress);
  const makerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.makerAssetData,
  ).tokenAddress;
  const makerToken = await getToken(environment, makerTokenAddress);

  const makerQuantity = createQuantity(
    makerToken,
    signedOrder.makerAssetAmount.toString(),
  );

  await ensureSufficientBalance(environment, makerQuantity, vaultAddress);
  await ensureNotInOpenMakeOrder(environment, contractAddress, { makerToken });
};

const prepareArgs: PrepareArgsFunction<Make0xOrderArgs> = async (
  environment,
  { signedOrder },
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

  const args = [
    exchangeIndex,
    FunctionSignatures.makeOrder,
    [
      contractAddress.toString(),
      emptyAddress,
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
      0,
      0,
    ],
    web3Utils.padLeft('0x0', 64),
    signedOrder.makerAssetData,
    signedOrder.takerAssetData,
    `${signedOrder.signature}`,
  ];

  return args;
};

const postProcess: PostProcessFunction<Make0xOrderArgs, boolean> = async (
  environment,
  _,
  { signedOrder },
  contractAddress,
) => {
  // Check after the transaction if the signature is valid
  const zeroExAddress =
    environment.deployment.exchangeConfigs[Exchanges.ZeroEx].exchange;
  const validSignature = await isValidSignature(environment, zeroExAddress, {
    signedOrder,
  });

  ensure(validSignature, 'Signature invalid');

  // console.log(signedOrder, contractAddress);
  // TODO: This fails
  // const validSignatureOffChain = await isValidSignatureOffChain(
  //   environment,
  //   R.omit(['signature'], signedOrder),
  //   signedOrder.signature,
  //   zeroExAddress.toString(),
  // );

  // ensure(validSignatureOffChain, 'Off-chain Signature invalid');
  return true;
};

const make0xOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
);

export { make0xOrder };
