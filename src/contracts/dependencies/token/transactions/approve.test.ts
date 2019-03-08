import { createQuantity, Address } from '@melonproject/token-math';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployToken } from '../transactions/deploy';
import { getToken } from '../calls/getToken';
import { approve } from './approve';

describe('approve', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.address = await deployToken(shared.env);
    shared.token = await getToken(shared.env, shared.address);
    shared.accounts = (await shared.env.eth.getAccounts()).map(
      a => new Address(a),
    );
  });

  it('approve', async () => {
    const howMuch = createQuantity(shared.token, '1000000000000000000');

    const receipt = await approve(shared.env, {
      howMuch,
      spender: shared.accounts[1],
    });

    expect(receipt).toBeTruthy();
  });

  it('insufficent balance', async () => {
    await expect(
      approve(shared.env, {
        howMuch: createQuantity(shared.token, '2000000000000000000000000'),
        spender: shared.accounts[1],
      }),
    ).rejects.toThrow('Insufficient');
  });
});
