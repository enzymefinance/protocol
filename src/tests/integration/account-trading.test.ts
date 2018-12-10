import { createQuantity } from '@melonproject/token-math/quantity';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { deploySystem } from '~/utils/deploySystem';
import { makeOrderFromAccountOasisDex } from '~/contracts/exchanges/transactions/makeOrderFromAccountOasisDex';
import takeOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/takeOrderFromAccountOasisDex';
import cancelOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/cancelOrderFromAccountOasisDex';

describe('account-trading', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await deploySystem(await initTestEnvironment());
    shared.accounts = await shared.env.eth.getAccounts();
  });

  it('Happy path', async () => {
    const matchingMarketAddress = shared.env.deployment.exchangeConfigs.find(
      o => o.name === 'MatchingMarket',
    ).exchangeAddress;

    const mlnToken = getTokenBySymbol(shared.env, 'MLN');
    const wethToken = getTokenBySymbol(shared.env, 'WETH');

    const order1 = await makeOrderFromAccountOasisDex(
      shared.env,
      matchingMarketAddress,
      {
        buy: createQuantity(mlnToken, 2),
        sell: createQuantity(wethToken, 0.1),
      },
    );
    expect(order1.buy).toEqual(createQuantity(mlnToken, 2));
    expect(order1.sell).toEqual(createQuantity(wethToken, 0.1));

    await takeOrderFromAccountOasisDex(shared.env, matchingMarketAddress, {
      buy: order1.buy,
      id: order1.id,
      maxTakeAmount: order1.sell,
      sell: order1.sell,
    });

    const order2 = await makeOrderFromAccountOasisDex(
      shared.env,
      matchingMarketAddress,
      {
        buy: createQuantity(mlnToken, 2),
        sell: createQuantity(wethToken, 0.1),
      },
    );

    expect(order2.buy).toEqual(createQuantity(mlnToken, 2));
    expect(order2.sell).toEqual(createQuantity(wethToken, 0.1));

    await cancelOrderFromAccountOasisDex(shared.env, matchingMarketAddress, {
      id: order2.id,
    });
  });
});
