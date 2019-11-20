import { SignatureType } from '@0x/types';
import {
  generatePseudoRandomSalt,
  assetDataUtils,
  orderHashUtils,
  signatureUtils
} from '@0x/order-utils';

import { emptyAddress } from './constants';

/**
 * For Ethfinex orders: The makerQuantity.token has to be the
 * Ethfinex Wrapper contract
 */
export const createUnsignedZeroExOrder = async (
  environment,
  exchange,
  {
    makerTokenAddress,
    makerAssetAmount,
    takerTokenAddress,
    takerAssetAmount,
    duration = 24 * 60 * 60,
    makerAddress,
    feeRecipientAddress,
    takerFee,
  },
) => {
  const makerAssetData = assetDataUtils.encodeERC20AssetData(makerTokenAddress);
  const takerAssetData = assetDataUtils.encodeERC20AssetData(takerTokenAddress);
  const latestBlock = await environment.eth.getBlock('latest');
  const formattedTakerFee = takerFee
    ? takerFee.toString()
    : '0';

  const order = {
    exchangeAddress: exchange.toLowerCase(),
    makerAddress: makerAddress.toLowerCase(),
    takerAddress: emptyAddress,
    senderAddress: emptyAddress,
    feeRecipientAddress: (
      feeRecipientAddress || emptyAddress
    ).toLowerCase(),
    expirationTimeSeconds: String(latestBlock.timestamp + duration),
    salt: generatePseudoRandomSalt()
      .toString()
      .slice(0, 10),
    makerAssetAmount,
    takerAssetAmount,
    makerAssetData,
    takerAssetData,
    makerFee: '0',
    takerFee: formattedTakerFee,
  };

  return order;
};

export const isValidZeroExSignatureOffChain = (
  environment,
  order,
  signature,
  makerAddress
) => {
  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  return signatureUtils.isValidSignatureAsync(
    environment.eth.currentProvider,
    orderHashHex,
    signature,
    makerAddress.toLowerCase()
  );
};

export const signZeroExOrder = async (environment, order, signer) => {
  const signerFormatted = signer.toLowerCase();
  const signedOrder = await signatureUtils.ecSignOrderAsync(
    environment.eth.currentProvider,
    order,
    signerFormatted,
  );

  const signatureTyped =
    signedOrder.makerAddress.toLowerCase() === signerFormatted
      ? signedOrder
      : {
          ...signedOrder,
          signature: `${signedOrder.signature.slice(0, -1)}${
            SignatureType.PreSigned
          }`
        };
  return signatureTyped;
};
