import { setToBeAroundBigNumberTolerance, setToCostLessThanTolerance } from '@enzymefinance/hardhat';
import { deployProtocolFixture, unlockAllWhales } from '@enzymefinance/testutils';

setToBeAroundBigNumberTolerance(0.01); // 1%
setToCostLessThanTolerance(0.03); // 3%

beforeAll(async () => {
  global.whales = await unlockAllWhales();
  global.fork = await deployProtocolFixture();
});
