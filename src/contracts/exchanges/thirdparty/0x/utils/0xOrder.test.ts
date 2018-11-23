import * as web3EthAbi from 'web3-eth-abi';
import * as R from 'ramda';

import { initTestEnvironment } from '~/utils/environment';
import { deploy0xExchange } from '../../../transactions/deploy0xExchange';
import { deployToken, getToken } from '~/contracts/dependencies/token';
import { createQuantity } from '@melonproject/token-math/quantity';
import { create0xOrder, sign0xOrder } from './create0xOrder';
import { fillOrder } from '../transactions/fillOrder';

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();

  shared.wethToken = await getToken(await deployToken('WETH'));
  shared.mlnToken = await getToken(await deployToken('MLN'));
  shared.zrxToken = await getToken(await deployToken('ZRX'));

  shared.zeroExAddresses = await deploy0xExchange({
    zrxToken: shared.zrxToken,
  });
});

test('Happy path', async () => {
  const makerQuantity = createQuantity(shared.mlnToken, 1);
  const takerQuantity = createQuantity(shared.wethToken, 0.05);

  const unsigned0xOrder = await create0xOrder(
    {
      erc20Proxy: shared.zeroExAddresses.erc20Proxy,
      exchange: shared.zeroExAddresses.exchange,
      from: shared.accounts[0],
      makerQuantity,
      takerQuantity,
    },
    shared.environment,
  );

  const signedOrder = await sign0xOrder(unsigned0xOrder, shared.environment);
  expect(signedOrder.exchangeAddress).toBe(
    shared.zeroExAddresses.exchange.toLowerCase(),
  );
  expect(signedOrder.makerAddress).toBe(shared.accounts[0].toLowerCase());
  expect(signedOrder.makerAssetAmount.toString()).toBe(
    makerQuantity.quantity.toString(),
  );

  // const signedOrderPairs = R.toPairs(signedOrder);
  // const stringified = R.map(
  //   ([key, value]) => [key, value.toString()],
  //   signedOrderPairs,
  // );
  // const stringifiedSignedOrder = R.fromPairs(stringified);

  // console.log(
  //   stringifiedSignedOrder.expirationTimeSeconds,
  //   Math.floor(Date.now() / 1000),
  // );

  // const exchangeAbi = requireMap[Contracts.ZeroExExchange];
  // const fillOrderAbi = exchangeAbi.filter(a => a.name === 'fillOrder')[0];
  // const encoded = web3EthAbi.encodeFunctionCall(fillOrderAbi, [
  //   stringifiedSignedOrder,
  //   stringifiedSignedOrder.makerAssetAmount,
  //   stringifiedSignedOrder.signature,
  // ]);

  // console.log(JSON.stringify(encoded, null, 2));

  const result = await fillOrder(
    shared.zeroExAddresses.exchange,
    { signedOrder },
    { from: shared.accounts[1] },
  );

  console.log(result);

  //
  /*
  - makerQuantity
  - takerQuantity


  - sign0xOrder
  - fill0xOrder
   */
});
