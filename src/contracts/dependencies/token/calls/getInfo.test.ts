import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { getInfo } from '../calls/getInfo';
import { deployToken } from '../transactions/deploy';

describe('getInfo', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.address = await deployToken(shared.env);
  });

  it('getInfo', async () => {
    const info = await getInfo(shared.env, shared.address);

    expect(info.symbol).toBe('FIXED');
    expect(info.name).toBe('Premined Token');
    expect(info.decimals).toBe(18);
    expect(info.totalSupply).toBe(1000000 * 10 ** 18);
  });
});
