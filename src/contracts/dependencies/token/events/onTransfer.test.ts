import { Address } from '@melonproject/token-math/address';
import { createQuantity } from '@melonproject/token-math/quantity';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { getToken } from '../calls/getToken';
import { transfer } from '../transactions/transfer';
import { onTransfer } from '../events/onTransfer';
import { deployToken } from '../transactions/deploy';

describe('onTransfer', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.address = await deployToken(shared.env);
    shared.token = await getToken(shared.env, shared.address);
    shared.accounts = (await shared.env.eth.getAccounts()).map(
      account => new Address(account),
    );
  });

  it('onTransfer', async done => {
    onTransfer(shared.env, shared.token.address, {
      from: new Address(shared.accounts[0]),
    }).subscribe(a => {
      expect(a.from).toBe(shared.accounts[0].toString());
      expect(a.to).toBe(shared.accounts[1].toString());
      expect(a.value).toBe('1000000000000000000');
      done();
    });

    await transfer(shared.env, {
      howMuch: createQuantity(shared.token, '1000000000000000000'),
      to: shared.accounts[1],
    });
  });
});
