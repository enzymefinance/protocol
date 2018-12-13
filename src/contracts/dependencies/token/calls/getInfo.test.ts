import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { getInfo } from '../calls/getInfo';
import { deployToken } from '../transactions/deploy';
import { Environment } from '~/utils/environment/Environment';
import testJson from '~/../deployments/test.json';

describe('getInfo', () => {
  const shared: {
    env?: Environment;
    [p: string]: any;
  } = {};

  beforeAll(async () => {
    const env = await initTestEnvironment();
    shared.env = {
      ...env,
      deployment: testJson,
    };
    shared.address = await deployToken(shared.env);
  });

  it('getInfo', async () => {
    const info = await getInfo(shared.env, shared.address);

    expect(info.symbol).toBe('FIXED');
    expect(info.name).toBe('Premined Token');
    expect(info.decimals).toBe(18);
    expect(info.totalSupply).toBe(1000000 * 10 ** 18);
  });

  it('Info gets overridden', async () => {
    const tokenAddress = await deployToken(shared.env, 'TEST');

    const modifiedEnv = {
      ...shared.env,
      deployment: {
        ...shared.env.deployment,
        thirdpartyContracts: {
          ...shared.env.deployment.thirdpartyContracts,
          tokens: [
            {
              address: tokenAddress.toString(),
              decimals: 18,
              symbol: 'NOT-TEST',
            },
          ],
        },
      },
    };

    const info = await getInfo(modifiedEnv, tokenAddress);
    expect(info.symbol).toBe('NOT-TEST');
  });
});
