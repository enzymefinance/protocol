import { Environment } from '~/utils/environment/Environment';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { Exchanges } from '~/Contracts';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { createQuantity, isEqual } from '@melonproject/token-math';
import { makeOasisDexOrder } from './makeOasisDexOrder';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { cancelOasisDexOrder } from './cancelOasisDexOrder';
import { getActiveOasisDexOrders } from '~/contracts/exchanges/calls/getActiveOasisDexOrders';
import takeOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/takeOrderFromAccountOasisDex';
import { getOasisDexOrder } from '~/contracts/exchanges/calls/getOasisDexOrder';

describe('makeOasisDexOrder', () => {
  const shared: {
    env?: Environment;
    [p: string]: any;
  } = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    shared.accounts = await shared.env.eth.getAccounts();
    shared.routes = await setupInvestedTestFund(shared.env);

    shared.oasisDex =
      shared.env.deployment.exchangeConfigs[Exchanges.MatchingMarket].exchange;

    shared.mln = getTokenBySymbol(shared.env, 'MLN');
    shared.weth = getTokenBySymbol(shared.env, 'WETH');
  });

  it('make oasisdex order', async () => {
    const makerQuantity = createQuantity(shared.weth, 0.05);
    const takerQuantity = createQuantity(shared.mln, 1);

    const orderToCancel = await makeOasisDexOrder(
      shared.env,
      shared.routes.tradingAddress,
      { makerQuantity, takerQuantity },
    );

    expect(orderToCancel.buy).toEqual(takerQuantity);
    expect(orderToCancel.sell).toEqual(makerQuantity);
    expect(orderToCancel.maker).toEqual(shared.routes.tradingAddress);

    await expect(
      makeOasisDexOrder(shared.env, shared.routes.tradingAddress, {
        makerQuantity,
        takerQuantity,
      }),
    ).rejects.toThrow('open order');

    await cancelOasisDexOrder(shared.env, shared.routes.tradingAddress, {
      id: orderToCancel.id,
      maker: shared.routes.tradingAddress,
      makerAsset: orderToCancel.sell.token.address,
      takerAsset: orderToCancel.buy.token.address,
    });

    // Now it should work again
    const orderToStay = await makeOasisDexOrder(
      shared.env,
      shared.routes.tradingAddress,
      {
        makerQuantity,
        takerQuantity,
      },
    );

    const orders = await getActiveOasisDexOrders(
      shared.env,
      shared.env.deployment.melonContracts.adapters.matchingMarketAccessor,
      {
        buyAsset: takerQuantity.token.address,
        sellAsset: makerQuantity.token.address,
        targetExchange: shared.oasisDex,
      },
    );

    expect(orders.length).toBe(1);

    const gotOrder = await getOasisDexOrder(shared.env, shared.oasisDex, {
      id: orderToStay.id,
    });

    expect(isEqual(gotOrder.buy, takerQuantity)).toBe(true);
    expect(isEqual(gotOrder.buy, orderToStay.buy)).toBe(true);

    await takeOrderFromAccountOasisDex(shared.env, shared.oasisDex, {
      buy: orderToStay.buy,
      id: orderToStay.id,
      maxTakeAmount: orderToStay.sell,
      sell: orderToStay.sell,
    });
  });
});
