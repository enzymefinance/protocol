import { setToBeAroundBigNumberTolerance, setToCostLessThanTolerance } from '@enzymefinance/hardhat';
import { deployProtocolFixture, unlockAllWhales } from '@enzymefinance/testutils';

setToBeAroundBigNumberTolerance(0.01); // 1%
setToCostLessThanTolerance(0.03); // 3%

beforeAll(async () => {
  (global as any).whales = await unlockAllWhales();
  (global as any).fork = await deployProtocolFixture();
});
