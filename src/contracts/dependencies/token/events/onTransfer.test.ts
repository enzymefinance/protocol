import { Address } from '@melonproject/token-math/address';
import { createQuantity } from '@melonproject/token-math/quantity';

import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';

import { transfer, deploy, getToken, onTransfer } from '..';

const shared: any = {};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

beforeAll(async () => {
  await initTestEnvironment();
  const environment = getGlobalEnvironment();

  shared.address = await deploy();
  shared.token = await getToken(shared.address);
  shared.accounts = (await environment.eth.getAccounts()).map(
    account => new Address(account),
  );
});

test('onTransfer', async () => {
  onTransfer(shared.token.address, {
    from: new Address(shared.accounts[0]),
  }).subscribe(a => console.log(a));

  await transfer({
    howMuch: createQuantity(shared.token, '1000000000000000000'),
    to: shared.accounts[1],
  });

  await delay(1000);
});
