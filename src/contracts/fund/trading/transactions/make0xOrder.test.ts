import { createQuantity } from '@melonproject/token-math/quantity';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import {
  createOrder,
  signOrder,
  fillOrder,
} from '~/contracts/exchanges/third-party/0x';
import { make0xOrder } from './make0xOrder';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { Exchanges } from '~/Contracts';

describe('make0xOrder', () => {
  const shared: any = {};

  beforeAll(async () => {
    const env = await deployAndInitTestEnv();
    shared.env = env;
    shared.accounts = await shared.env.eth.getAccounts();
    shared.settings = await setupInvestedTestFund(shared.env);

    shared.zeroExAddress =
      env.deployment.exchangeConfigs[Exchanges.ZeroEx].exchange;

    shared.mln = getTokenBySymbol(shared.env, 'MLN');
    shared.weth = getTokenBySymbol(shared.env, 'WETH');
  });

  it('Make 0x order from fund and take it from account', async () => {
    const makerQuantity = createQuantity(shared.weth, 0.05);
    const takerQuantity = createQuantity(shared.mln, 1);

    const unsigned0xOrder = await createOrder(
      shared.env,
      shared.zeroExAddress,
      {
        makerAddress: shared.settings.tradingAddress,
        makerQuantity,
        takerQuantity,
      },
    );

    const signedOrder = await signOrder(shared.env, unsigned0xOrder);

    const result = await make0xOrder(
      shared.env,
      shared.settings.tradingAddress,
      {
        signedOrder,
      },
    );

    expect(result).toBe(true);

    const filled = await fillOrder(shared.env, shared.zeroExAddress, {
      signedOrder,
    });

    expect(filled).toBeTruthy();
  });
});
