import { unlockAllWhales } from '@enzymefinance/testutils';

beforeAll(async () => {
  global.whales = await unlockAllWhales();
});
