import { createQuantity } from '@melonproject/token-math/quantity';
import { getPrice, isEqual } from '@melonproject/token-math/price';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { update } from './update';
import { deployTestingPriceFeed } from './deployTestingPriceFeed';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

describe('update', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.quoteToken = await getToken(
      shared.env,
      await deployToken(shared.env, 'WETH'),
    );
    shared.mlnToken = await getToken(
      shared.env,
      await deployToken(shared.env, 'MLN'),
    );
    shared.address = await deployTestingPriceFeed(
      shared.env,
      shared.quoteToken,
    );
  });

  it('update', async () => {
    const newPrice = getPrice(
      createQuantity(shared.mlnToken, 1),
      createQuantity(shared.quoteToken, 0.34),
    );

    const receipt = await update(shared.env, shared.address, [newPrice]);

    expect(isEqual(receipt[0], newPrice)).toBe(true);
  });
});
