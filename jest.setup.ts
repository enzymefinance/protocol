import { deployProtocolFixture } from '@enzymefinance/testutils';

beforeAll(async () => {
  global.fork = await deployProtocolFixture();
  await global.provider.send('hardhat_impersonateAccount', [(global as any).fork.config.gsn.relayWorker]);
});
