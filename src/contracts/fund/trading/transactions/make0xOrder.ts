import * as web3Utils from 'web3-utils';
import {
  signatureUtils,
  assetDataUtils,
  orderHashUtils,
  SignedOrder,
  SignatureType,
} from '0x.js';

import {
  PrepareArgsFunction,
  transactionFactory,
  getDeployment,
  GuardFunction,
} from '~/utils/solidity';
import {
  CreateOrderArgs,
  createOrder,
  isValidSignature,
} from '~/contracts/exchanges';
import { Contracts } from '~/Contracts';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { NULL_ADDRESS } from './take0xOrder';
import { ensure } from '~/utils/guards';

// The order needs to be signed by the manager
interface Make0xOrderArgs {
  signedOrder: SignedOrder;
}

const guard: GuardFunction<Make0xOrderArgs> = async (
  { signedOrder },
  contractAddress,
  environment,
) => {
  const deployment = await getDeployment(environment);

  const zeroExAddress = deployment.exchangeConfigs.find(
    o => o.name === 'ZeroEx',
  ).exchangeAddress;

  const validSignature = await isValidSignature(zeroExAddress, { signedOrder });
  ensure(validSignature, 'Signature invalid');
};

const prepareArgs: PrepareArgsFunction<Make0xOrderArgs> = async (
  { signedOrder },
  contractAddress,
  environment,
) => {
  const deployment = await getDeployment(environment);

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

  const args = [
    exchangeIndex,
    'makeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
    [
      contractAddress.toString(),
      NULL_ADDRESS,
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
      0,
      0,
    ],
    web3Utils.padLeft('0x0', 64),
    signedOrder.makerAssetData,
    signedOrder.takerAssetData,
    `${signedOrder.signature.slice(0, -1)}${SignatureType.PreSigned}`,

    // signatureUtils.convertToSignatureWithType(
    //   signedOrder.signature.substring(0, signedOrder.signature.length - 1),
    //   SignatureType.PreSigned,
    // ),
  ];

  // console.log(environment.wallet.address.toLowerCase(), '\n\n\n');

  // const orderHash = orderHashUtils.getOrderHashHex(signedOrder);
  // const isValid = await signatureUtils.isValidPresignedSignatureAsync(
  //   environment.eth.currentProvider,
  //   orderHash,
  //   contractAddress.toLowerCase(), // environment.wallet.address.toLowerCase(),
  // );

  console.log(
    signedOrder.signature,
    `${signedOrder.signature.slice(0, -1)}${SignatureType.PreSigned}`,
    SignatureType.PreSigned,
    args,
  );

  return args;
};

const make0xOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
);

export { make0xOrder };
