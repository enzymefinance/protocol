import {
  generatePseudoRandomSalt,
  assetDataUtils,
  signatureUtils
} from '@0x/order-utils';

import { SignatureType } from '@0x/types';

import web3 from '~/deploy/utils/get-web3';

import { EMPTY_ADDRESS } from '~/tests/utils/constants';

export const createUnsignedZeroExOrder = async (
  exchange,
  chainId,
  {
    makerTokenAddress,
    makerAssetAmount,
    takerTokenAddress,
    takerAssetAmount,
    duration = 24 * 60 * 60,
    makerAddress,
    feeRecipientAddress,
    makerFee,
    makerFeeTokenAddress,
    takerFee,
    takerFeeTokenAddress
  },
) => {
  const makerAssetData = assetDataUtils.encodeERC20AssetData(makerTokenAddress);
  const takerAssetData = assetDataUtils.encodeERC20AssetData(takerTokenAddress);
  const makerFeeAssetData = makerFeeTokenAddress
    ? assetDataUtils.encodeERC20AssetData(makerFeeTokenAddress)
    : '0x';
  const takerFeeAssetData = takerFeeTokenAddress
    ? assetDataUtils.encodeERC20AssetData(takerFeeTokenAddress)
    : '0x';
  const latestBlock = await web3.eth.getBlock('latest');
  const formattedMakerFee = makerFee
    ? makerFee.toString()
    : '0';
  const formattedTakerFee = takerFee
    ? takerFee.toString()
    : '0';

  const order = {
    chainId,
    exchangeAddress: exchange.toLowerCase(),
    makerAddress: makerAddress.toLowerCase(),
    takerAddress: EMPTY_ADDRESS,
    senderAddress: EMPTY_ADDRESS,
    feeRecipientAddress: (
      feeRecipientAddress || EMPTY_ADDRESS
    ).toLowerCase(),
    expirationTimeSeconds: String(latestBlock.timestamp + duration),
    salt: generatePseudoRandomSalt()
      .toString()
      .slice(0, 10),
    makerAssetAmount,
    takerAssetAmount,
    makerAssetData,
    takerAssetData,
    makerFee: formattedMakerFee,
    takerFee: formattedTakerFee,
    makerFeeAssetData,
    takerFeeAssetData
  };

  return order;
};

export const signZeroExOrder = async (order, signer) => {
  const signerFormatted = signer.toLowerCase();
  const signedOrder = await signatureUtils.ecSignOrderAsync(
    web3.eth.currentProvider,
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
