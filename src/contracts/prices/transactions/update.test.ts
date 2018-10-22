import { createQuantity } from '@melonproject/token-math/quantity';
import { getPrice, isEqual } from '@melonproject/token-math/price';

import { initTestEnvironment } from '~/utils/environment';

import { update } from './update';
import { deploy } from './deploy';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.quoteToken = {
    address: '0xf9Df6AEc03A59503AD596B9AB68b77dc2937F69D',
    decimals: 18,
    symbol: 'ETH',
  };
  shared.mlnToken = {
    address: '0x50E2a5cC79B7B281103E65F1308C3a928aa91515',
    decimals: 18,
    symbol: 'MLN',
  };

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
