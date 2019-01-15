import { Environment } from '~/utils/environment/Environment';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { Exchanges } from '~/Contracts';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { createQuantity } from '@melonproject/token-math';
import { makeOasisDexOrder } from './makeOasisDexOrder';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { cancelOasisDexOrder } from './cancelOasisDexOrder';

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

    const order = await makeOasisDexOrder(
      shared.env,
      shared.routes.tradingAddress,
      { makerQuantity, takerQuantity },
    );

    expect(order.buy).toEqual(takerQuantity);
    expect(order.sell).toEqual(makerQuantity);
    expect(order.maker).toEqual(shared.routes.tradingAddress);

    await expect(
      makeOasisDexOrder(shared.env, shared.routes.tradingAddress, {
        makerQuantity,
        takerQuantity,
      }),
    ).rejects.toThrow('open order');

    await cancelOasisDexOrder(shared.env, shared.routes.tradingAddress, {
      id: order.id,
      maker: shared.routes.tradingAddress,
      makerAsset: order.sell.token.address,
      takerAsset: order.buy.token.address,
    });

    // Now it should work again
    await makeOasisDexOrder(shared.env, shared.routes.tradingAddress, {
      makerQuantity,
      takerQuantity,
    });
  });
});
