import { setGasCostAssertionTolerance } from '@enzymefinance/hardhat';
import { deployProtocolFixture, unlockAllWhales } from '@enzymefinance/testutils';

setGasCostAssertionTolerance(0.03);

beforeAll(async () => {
  global.whales = await unlockAllWhales();
  global.fork = await deployProtocolFixture();
});
