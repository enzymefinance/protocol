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
  assetDataUtils,
  BigNumber,
  generatePseudoRandomSalt,
  orderHashUtils,
  signatureUtils,
  Web3ProviderEngine,
  RPCSubprovider,
} from '0x.js';
import { Order, SignedOrder } from '@0x/types';
import { constants } from '@0x/order-utils/lib/src/constants';
import { getGlobalEnvironment } from '~/utils/environment';
import { Address } from '@melonproject/token-math/address';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { approve } from '~/contracts/dependencies/token';
import { getLatestBlock } from '~/utils/evm';
import { add, toBI } from '@melonproject/token-math/bigInteger';
import { getAssetProxy } from '../calls/getAssetProxy';

interface Create0xOrderArgs {
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  duration?: number;
}

interface Sign0xOrderArgs {
  order: Order;
  orderHash: string;
}

const create0xOrder = async (
  exchange: Address,
  { makerQuantity, takerQuantity, duration = 24 * 60 * 60 }: Create0xOrderArgs,
  environment = getGlobalEnvironment(),
): Promise<Sign0xOrderArgs> => {
  const erc20Proxy = await getAssetProxy(exchange);

  await approve({ howMuch: makerQuantity, spender: erc20Proxy });

  const makerAssetData = assetDataUtils.encodeERC20AssetData(
    makerQuantity.token.address,
  );
  const takerAssetData = assetDataUtils.encodeERC20AssetData(
    takerQuantity.token.address,
  );

  const latestBlock = await getLatestBlock(environment);

  // tslint:disable:object-literal-sort-keys
  const order: Order = {
    exchangeAddress: `${exchange.toLowerCase()}`,
    makerAddress: `${environment.wallet.address.toLowerCase()}`,
    takerAddress: constants.NULL_ADDRESS,
    senderAddress: constants.NULL_ADDRESS,
    feeRecipientAddress: constants.NULL_ADDRESS,
    expirationTimeSeconds: new BigNumber(
      add(latestBlock.timestamp, toBI(duration)).toString(),
    ),
    salt: generatePseudoRandomSalt(),
    makerAssetAmount: new BigNumber(`${makerQuantity.quantity}`),
    takerAssetAmount: new BigNumber(`${takerQuantity.quantity}`),
    makerAssetData,
    takerAssetData,
    makerFee: constants.ZERO_AMOUNT,
    takerFee: constants.ZERO_AMOUNT,
  };

  const orderHash = orderHashUtils.getOrderHashHex(order);

  return {
    order,
    orderHash,
  };
};

// This is just a reference implementation
const sign0xOrder = async (
  { order, orderHash }: Sign0xOrderArgs,
  environment = getGlobalEnvironment(),
): Promise<SignedOrder> => {
  const providerEngine = new Web3ProviderEngine();
  providerEngine.addProvider(new RPCSubprovider('http://localhost:8545'));
  providerEngine.start();
  // tslint:disable-next-line:max-line-length
  const web3signature = await environment.eth.sign(
    orderHash,
    order.makerAddress,
  );
  const signature = await signatureUtils.ecSignHashAsync(
    providerEngine,
    orderHash,
    order.makerAddress,
  );

  // console.log('orderHash', orderHash);
  // console.log('signature    ', signature);
  // console.log('web3signature', web3signature);
  const signedOrder = { ...order, signature };
  return signedOrder;
};

export { create0xOrder, sign0xOrder };
