import {
  setToBeAroundBigNumberTolerance,
  setToCostAroundTolerance,
  setToCostLessThanTolerance,
} from '@enzymefinance/hardhat';
import { deployProtocolFixture, unlockAllWhales } from '@enzymefinance/testutils';

setToBeAroundBigNumberTolerance(0.01); // 1%
setToCostAroundTolerance(1000); // 1000 gas units
setToCostLessThanTolerance(0.03); // 3%

beforeAll(async () => {
  (global as any).whales = await unlockAllWhales();
  (global as any).fork = await deployProtocolFixture();
  await (global as any).provider.send('hardhat_impersonateAccount', [(global as any).fork.config.gsn.relayWorker]);
});
