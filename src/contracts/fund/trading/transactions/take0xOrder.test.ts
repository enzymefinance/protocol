import { createQuantity, isEqual } from '@melonproject/token-math/quantity';
import { take0xOrder } from './take0xOrder';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import {
  createOrder,
  signOrder,
  approveOrder,
} from '~/contracts/exchanges/third-party/0x';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { Exchanges } from '~/Contracts';

describe('take0xOrder', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    shared.accounts = await shared.env.eth.getAccounts();
    // shared.envNotManager = withDifferentAccount(
    //   shared.accounts[1],
    //   shared.env,
    // );

    shared.routes = await setupInvestedTestFund(shared.env);
    shared.zeroExAddress =
      shared.env.deployment.exchangeConfigs[Exchanges.ZeroEx].exchange;

    shared.mln = getTokenBySymbol(shared.env, 'MLN');
    shared.weth = getTokenBySymbol(shared.env, 'WETH');

    const makerQuantity = createQuantity(shared.mln, 1);
    const takerQuantity = createQuantity(shared.weth, 0.05);

    const unsigned0xOrder = await createOrder(
      shared.env,
      shared.zeroExAddress,
      {
        makerQuantity,
        takerQuantity,
      },
    );

    shared.signedOrder = await signOrder(shared.env, unsigned0xOrder);
    await approveOrder(shared.env, shared.zeroExAddress, shared.signedOrder);
  });

  it('Take off-chain order from fund', async () => {
    const takerQuantity = createQuantity(shared.weth, 0.02);

    const order = await take0xOrder(shared.env, shared.routes.tradingAddress, {
      signedOrder: shared.signedOrder,
      takerQuantity,
    });

    expect(isEqual(order.takerFilledAmount, takerQuantity)).toBe(true);
  });
});
