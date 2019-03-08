import { createQuantity, Address } from '@melonproject/token-math';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { getToken } from '../calls/getToken';
import { transfer } from '../transactions/transfer';
import { deployToken } from '../transactions/deploy';

describe('transfer', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.address = await deployToken(shared.env);
    shared.token = await getToken(shared.env, shared.address);
    shared.accounts = (await shared.env.eth.getAccounts()).map(
      account => new Address(account),
    );
  });

  it('transfer', async () => {
    const howMuch = createQuantity(shared.token, '1000000000000000000');
    const receipt = await transfer(shared.env, {
      howMuch,
      to: shared.accounts[1],
    });

    expect(receipt).toBeTruthy();
  });

  it('insufficent balance', async () => {
    await expect(
      transfer(shared.env, {
        howMuch: createQuantity(shared.token, '2000000000000000000000000'),
        to: shared.accounts[1],
      }),
    ).rejects.toThrow('Insufficient');
  });
});
