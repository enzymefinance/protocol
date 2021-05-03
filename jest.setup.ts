import { setBeAroundBigNumberAssertionTolerance, setGasCostAssertionTolerance } from '@enzymefinance/hardhat';
import { deployProtocolFixture, unlockAllWhales } from '@enzymefinance/testutils';

setBeAroundBigNumberAssertionTolerance(0.01); // 1%
setGasCostAssertionTolerance(0.03); // 3%

beforeAll(async () => {
  global.whales = await unlockAllWhales();
  global.fork = await deployProtocolFixture();
});
