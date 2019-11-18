import { createQuantity } from '@melonproject/token-math';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { make0xOrder } from './make0xOrder';
import { cancel0xOrder } from './cancel0xOrder';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { Exchanges } from '~/Contracts';
import { createOrder } from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { fillOrder } from '~/contracts/exchanges/third-party/0x/transactions/fillOrder';

describe('cancel0xOrder', () => {
  const shared = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    shared.accounts = await shared.env.eth.getAccounts();
    shared.routes = await setupInvestedTestFund(shared.env);

    shared.zeroExAddress =
      shared.env.deployment.exchangeConfigs[Exchanges.ZeroEx].exchange;

    shared.mln = getTokenBySymbol(shared.env, 'MLN');
    shared.weth = getTokenBySymbol(shared.env, 'WETH');

    const unsigned0xOrder = await createOrder(
      shared.env,
      shared.zeroExAddress,
      {
        makerAddress: shared.routes.tradingAddress,
        makerQuantity: createQuantity(shared.weth, 0.05),
        takerQuantity: createQuantity(shared.mln, 1),
      },
    );

    shared.signedOrder = await signOrder(shared.env, unsigned0xOrder);

    const result = await make0xOrder(shared.env, shared.routes.tradingAddress, {
      signedOrder: shared.signedOrder,
    });

    expect(result).toBe(true);
  });

  // tslint:disable-next-line:max-line-length
  it('Previously made 0x order cancelled and not takeable anymore', async () => {
    const result = await cancel0xOrder(
      shared.env,
      shared.routes.tradingAddress,
      { signedOrder: shared.signedOrder },
    );

    expect(result).toBe(true);

    await expect(
      fillOrder(shared.env, shared.zeroExAddress, {
        signedOrder: shared.signedOrder,
      }),
    ).rejects.toThrow('CANCELLED');
  });
});
