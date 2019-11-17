// tslint:disable:max-line-length
/*
"TODO: Remove this
ReferenceError: regeneratorRuntime is not defined
  at node_modules/@ledgerhq/hw-transport-u2f/lib/TransportU2F.js:120:50      at node_modules/@ledgerhq/hw-transport-u2f/lib/TransportU2F.js:142:6
  at Object.<anonymous> (node_modules/@ledgerhq/hw-transport-u2f/lib/TransportU2F.js:228:2)
  at Object.<anonymous> (node_modules/@0xproject/subproviders/src/index.ts:2:1)
*/
// tslint:enable:max-line-length

import {
  generatePseudoRandomSalt,
  assetDataUtils,
  signatureUtils,
  orderHashUtils,
} from '@0x/order-utils';
// import { BigNumber } from 'bignumber.js';
import { constants } from '@0x/order-utils/lib/src/constants';
import { getLatestBlock } from '~/utils/evm';
import { BN } from 'web3-utils';
import { Contracts } from '~/Contracts';
import { getContract } from '~/utils/solidity/getContract';
import { AssetProxyId } from '@0x/types';

/**
 * For Ethfinex orders: The makerQuantity.token has to be the
 * Ethfinex Wrapper contract
 */
const createUnsignedOrder = async (
  environment,
  exchange,
  {
    makerTokenInfo,
    makerAssetAmount,
    takerTokenInfo,
    takerAssetAmount,
    duration = 24 * 60 * 60,
    makerAddress: givenMakerAddress,
    feeRecipientAddress,
    takerFee,
  },
) => {
  const makerAssetData = assetDataUtils.encodeERC20AssetData(
    makerTokenInfo.address,
  );

  const takerAssetData = assetDataUtils.encodeERC20AssetData(
    takerTokenInfo.address,
  );

  const latestBlock = await getLatestBlock(environment);
  const makerAddress = givenMakerAddress || environment.wallet.address;

  const formattedTakerFee = takerFee
    ? takerFee.toString()
    : constants.ZERO_AMOUNT;

  // tslint:disable:object-literal-sort-keys
  const order = {
    exchangeAddress: `${exchange.toLowerCase()}`,
    makerAddress: `${makerAddress.toLowerCase()}`,
    takerAddress: constants.NULL_ADDRESS,
    senderAddress: constants.NULL_ADDRESS,
    feeRecipientAddress: (
      feeRecipientAddress || constants.NULL_ADDRESS
    ).toLowerCase(),
    expirationTimeSeconds: new BN(latestBlock.timestamp)
      .add(new BN(duration))
      .toString(),
    salt: generatePseudoRandomSalt()
      .toString()
      .slice(0, 10),
    makerAssetAmount,
    takerAssetAmount,
    makerAssetData,
    takerAssetData,
    makerFee: constants.ZERO_AMOUNT,
    takerFee: formattedTakerFee,
  };

  return order;
};

const approveOrder = async (environment, exchangeAddress, order) => {
  const zrxExchange = getContract(
    environment,
    Contracts.ZeroExExchange,
    exchangeAddress,
  );
  const erc20ProxyAddress = await zrxExchange.methods
    .getAssetProxy(AssetProxyId.ERC20)
    .call();

  const makerTokenAddress = assetDataUtils.decodeERC20AssetData(
    order.makerAssetData,
  ).tokenAddress;

  const makerToken = getContract(
    environment,
    Contracts.StandardToken,
    makerTokenAddress,
  );

  await makerToken.methods
    .approve(erc20ProxyAddress, order.makerAssetAmount)
    .send({ from: environment.wallet.address, gas: 8000000 });
};

const isValidSignatureOffChain = async (
  environment,
  order,
  signature,
  makerAddress?,
) => {
  const orderHashHex = orderHashUtils.getOrderHashHex(order);

  return signatureUtils.isValidSignatureAsync(
    environment.eth.currentProvider,
    orderHashHex,
    signature,
    (makerAddress || environment.wallet.address).toLowerCase(),
  );
};

export { createUnsignedOrder, approveOrder, isValidSignatureOffChain };
