import {
  generatePseudoRandomSalt,
  assetDataUtils,
  orderHashUtils,
  signatureUtils
} from '@0x/order-utils-v2';
import { PrivateKeyWalletSubprovider, Web3ProviderEngine } from '@0x/subproviders';
import { SignatureType } from '@0x/types-v2';
import { providerUtils } from '@0x/utils';
import web3 from '~/deploy/utils/get-web3';
import { EMPTY_ADDRESS } from '~/tests/utils/constants';

// TODO: refactor along with zeroExV3 util
/**
 * For Ethfinex orders: The makerQuantity.token has to be the
 * Ethfinex Wrapper contract
 */
export const createUnsignedZeroExOrder = async (
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
  const latestBlock = await web3.eth.getBlock('latest');
  const formattedTakerFee = takerFee
    ? takerFee.toString()
    : '0';

  const order = {
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
    makerFee: '0',
    takerFee: formattedTakerFee,
  };

  return order;
};

export const isValidZeroExSignatureOffChain = (
  order,
  signature,
  makerAddress
) => {
  const orderHashHex = orderHashUtils.getOrderHashHex(order);

  return signatureUtils.isValidSignatureAsync(
    web3.eth.currentProvider,
    orderHashHex,
    signature,
    makerAddress.toLowerCase()
  );
};

const getPrivateKeyProvider = (wallet, signer) => {
  const providerEngine = new Web3ProviderEngine();

  const key = wallet[signer].privateKey.replace(/^0x/, '');
  const pkProvider = new PrivateKeyWalletSubprovider(key);
  providerEngine.addProvider(pkProvider);
  providerUtils.startProviderEngine(providerEngine);

  return providerEngine;
}

export const signZeroExOrder = async (order, signer) => {
  const signerFormatted = signer.toLowerCase();

  const pkProvider = getPrivateKeyProvider(web3.eth.accounts.wallet, signer);

  const signedOrder = await signatureUtils.ecSignOrderAsync(
    pkProvider,
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
