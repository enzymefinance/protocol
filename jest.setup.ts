import { deployProtocolFixture, unlockAllWhales } from '@enzymefinance/testutils';

beforeAll(async () => {
  global.whales = await unlockAllWhales();
  global.fork = await deployProtocolFixture();
  await global.provider.send('hardhat_impersonateAccount', [(global as any).fork.config.gsn.relayWorker]);
});
