// tslint:disable:max-line-length
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
// tslint:enable:max-line-length

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

  shared.zeroExAddress = await deploy0xExchange({
    zrxToken: shared.zrxToken,
  });
});

test('Happy path', async () => {
  const makerQuantity = createQuantity(shared.mlnToken, 1);
  const takerQuantity = createQuantity(shared.wethToken, 0.05);

  const unsignedOrder = await createOrder(
    shared.zeroExAddress,
    {
      makerQuantity,
      takerQuantity,
    },
    shared.environment,
  );

  await approveOrder(shared.zeroExAddress, unsignedOrder, shared.environment);

  const signedOrder = await signOrder(unsignedOrder, shared.environment);
  expect(signedOrder.exchangeAddress).toBe(shared.zeroExAddress.toLowerCase());
  expect(signedOrder.makerAddress).toBe(shared.accounts[0].toLowerCase());
  expect(signedOrder.makerAssetAmount.toString()).toBe(
    makerQuantity.quantity.toString(),
  );

  const result = await fillOrder(
    shared.zeroExAddress,
    {
      signedOrder,
    },
    shared.environmentTaker,
  );

  expect(result).toBeTruthy();
});
