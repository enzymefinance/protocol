import { createQuantity } from '@melonproject/token-math/quantity';
import { getPrice, isEqual } from '@melonproject/token-math/price';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { update } from './update';
import { deploy } from './deploy';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.quoteToken = await getToken(await deployToken('WETH'));
  shared.mlnToken = await getToken(await deployToken('MLN'));
  shared.address = await deploy(shared.quoteToken);
});

test('update', async () => {
  const newPrice = getPrice(
    createQuantity(shared.mlnToken, 1),
    createQuantity(shared.quoteToken, 0.34),
  );

  const receipt = await update(shared.address, [newPrice]);

  expect(isEqual(receipt[0], newPrice)).toBe(true);
});
