import { Environment } from '~/utils/environment/Environment';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { getToken } from '../calls/getToken';
import { createQuantity, isEqual } from '@melonproject/token-math';
import { balanceOf } from '../calls/balanceOf';
import { deployWeth } from './deployWeth';
import { deposit } from './deposit';

describe('deposit', () => {
  const shared: {
    env?: Environment;
    [p: string]: any;
  } = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.weth = await getToken(shared.env, await deployWeth(shared.env));
  });

  it('deposit', async () => {
    const quantity = createQuantity(shared.weth, 1);

    await deposit(shared.env, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const balance = await balanceOf(shared.env, shared.weth.address);

    expect(isEqual(quantity, balance)).toBe(true);
  });
});
