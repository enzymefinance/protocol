import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployToken } from './deploy';

describe('deploy', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
  });

  it('deploy', async () => {
    const address = await deployToken(shared.env);
    expect(address).toBeTruthy();
  });
});
