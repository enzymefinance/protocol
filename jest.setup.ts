import { setGasCostAssertionTolerance } from '@enzymefinance/hardhat';
import { unlockAllWhales } from '@enzymefinance/testutils';

setGasCostAssertionTolerance(0.03);

beforeAll(async () => {
  global.whales = await unlockAllWhales();
});
