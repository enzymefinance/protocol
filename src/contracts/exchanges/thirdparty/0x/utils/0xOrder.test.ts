// import * as web3EthAbi from 'web3-eth-abi';
// import * as R from 'ramda';

import { initTestEnvironment, withDifferentAccount } from '~/utils/environment';
import { deploy0xExchange } from '../../../transactions/deploy0xExchange';
import {
  deployToken,
  getToken,
  transfer,
} from '~/contracts/dependencies/token';
import { createQuantity } from '@melonproject/token-math/quantity';
import { create0xOrder, sign0xOrder } from './create0xOrder';
import { fillOrder } from '../transactions/fillOrder';

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
  shared.environmentTaker = withDifferentAccount(
    shared.accounts[1],
    shared.environment,
  );

  shared.wethToken = await getToken(await deployToken('WETH'));
  shared.mlnToken = await getToken(await deployToken('MLN'));
  shared.zrxToken = await getToken(await deployToken('ZRX'));

  await transfer({
    howMuch: createQuantity(shared.wethToken, 100),
    to: shared.environmentTaker.wallet.address,
  });

  shared.zeroExAddresses = await deploy0xExchange({
    zrxToken: shared.zrxToken,
  });
});

test('Happy path', async () => {
  const makerQuantity = createQuantity(shared.mlnToken, 1);
  const takerQuantity = createQuantity(shared.wethToken, 0.05);

  const unsigned0xOrder = await create0xOrder(
    shared.zeroExAddresses.exchange,
    {
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

  const result = await fillOrder(
    shared.zeroExAddresses.exchange,
    {
      signedOrder,
    },
    shared.environmentTaker,
  );

  expect(result).toBeTruthy();
});
