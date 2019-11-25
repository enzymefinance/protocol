import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';

describe('update', () => {
  let environment, deployer, altUser;
  let defaultTxOpts, altUserTxOpts;

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
    const newPrice = createPrice(
      createQuantity(shared.mlnToken, 1),
      createQuantity(shared.quoteToken, 0.34),
    );

    const receipt = await update(shared.env, shared.address, [newPrice]);

    expect(isEqual(receipt[0], newPrice)).toBe(true);
  });
});
