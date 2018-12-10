import { createQuantity } from '@melonproject/token-math/quantity';

import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import { makeOrderFromAccountOasisDex } from '~/contracts/exchanges/transactions/makeOrderFromAccountOasisDex';
import takeOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/takeOrderFromAccountOasisDex';
import cancelOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/cancelOrderFromAccountOasisDex';

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
});

test('Happy path', async () => {
  const deployment = await deploySystem();

  const matchingMarketAddress = deployment.exchangeConfigs.find(
    o => o.name === 'MatchingMarket',
  ).exchangeAddress;

  const order1 = await makeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: createQuantity(deployment.tokens[1], 2),
    sell: createQuantity(deployment.tokens[0], 0.1),
  });
  expect(order1.buy).toEqual(createQuantity(deployment.tokens[1], 2));
  expect(order1.sell).toEqual(createQuantity(deployment.tokens[0], 0.1));

  await takeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: order1.buy,
    id: order1.id,
    maxTakeAmount: order1.sell,
    sell: order1.sell,
  });

  const order2 = await makeOrderFromAccountOasisDex(matchingMarketAddress, {
    buy: createQuantity(deployment.tokens[1], 2),
    sell: createQuantity(deployment.tokens[0], 0.1),
  });

  expect(order2.buy).toEqual(createQuantity(deployment.tokens[1], 2));
  expect(order2.sell).toEqual(createQuantity(deployment.tokens[0], 0.1));

  await cancelOrderFromAccountOasisDex(matchingMarketAddress, {
    id: order2.id,
  });

  // const kyberSwap = await swapTokensFromAccount(kyberAddress, {
  //   srcQuantity: createQuantity(deployment.tokens[1], 0.00001),
  //   destQuantity: createQuantity(deployment.tokens[2], 0.06),
  //   minConversionRate: 0,
  // });

  // console.log(kyberSwap);
});
