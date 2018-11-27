import { Address } from '@melonproject/token-math/address';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { getToken } from '../calls/getToken';
import { transfer } from '../transactions/transfer';
import { onTransfer } from '../events/onTransfer';
import { deployToken } from '../transactions/deploy';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  const environment = getGlobalEnvironment();

  shared.address = await deployToken();
  shared.token = await getToken(shared.address);
  shared.accounts = (await environment.eth.getAccounts()).map(
    account => new Address(account),
  );
});

// TODO: We are currently using http:// because the ws:// endpoint
// causes Jest to fail, hence let's disable this test for now.
xit('onTransfer', async () =>
  new Promise(async resolve => {
    onTransfer(shared.token.address, {
      from: new Address(shared.accounts[0]),
    }).subscribe(a => {
      expect(a.from).toBe(shared.accounts[0].toString());
      expect(a.to).toBe(shared.accounts[1].toString());
      expect(a.value).toBe('1000000000000000000');
      resolve();
    });

    await transfer({
      howMuch: createQuantity(shared.token, '1000000000000000000'),
      to: shared.accounts[1],
    });
  }));
