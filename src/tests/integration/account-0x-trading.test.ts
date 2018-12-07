import { createQuantity } from '@melonproject/token-math/quantity';

import { deploy0xExchange } from '../../contracts/exchanges/transactions/deploy0xExchange';
import {
  createOrder,
  signOrder,
  approveOrder,
} from '../../contracts/exchanges/thirdparty/0x/utils/createOrder';
import { fillOrder } from '../../contracts/exchanges/thirdparty/0x/transactions/fillOrder';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';

const shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared.accounts = await shared.env.eth.getAccounts();
  shared.envTaker = withDifferentAccount(shared.env, shared.accounts[1]);

  shared.wethToken = await getToken(
    shared.env,
    await deployToken(shared.env, 'WETH'),
  );
  shared.mlnToken = await getToken(
    shared.env,
    await deployToken(shared.env, 'MLN'),
  );
  shared.zrxToken = await getToken(
    shared.env,
    await deployToken(shared.env, 'ZRX'),
  );

  await transfer(shared.env, {
    howMuch: createQuantity(shared.wethToken, 100),
    to: shared.envTaker.wallet.address,
  });

  shared.zeroExAddress = await deploy0xExchange(shared.env, {
    zrxToken: shared.zrxToken,
  });
});

test('Happy path', async () => {
  const makerQuantity = createQuantity(shared.mlnToken, 1);
  const takerQuantity = createQuantity(shared.wethToken, 0.05);

  const unsignedOrder = await createOrder(shared.env, shared.zeroExAddress, {
    makerQuantity,
    takerQuantity,
  });

  await approveOrder(shared.env, shared.zeroExAddress, unsignedOrder);

  const signedOrder = await signOrder(shared.env, unsignedOrder);
  expect(signedOrder.exchangeAddress).toBe(shared.zeroExAddress.toLowerCase());
  expect(signedOrder.makerAddress).toBe(shared.accounts[0].toLowerCase());
  expect(signedOrder.makerAssetAmount.toString()).toBe(
    makerQuantity.quantity.toString(),
  );

  const result = await fillOrder(shared.envTaker, shared.zeroExAddress, {
    signedOrder,
  });

  expect(result).toBeTruthy();
});
