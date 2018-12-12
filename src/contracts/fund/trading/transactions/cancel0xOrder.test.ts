import * as R from 'ramda';
import { createQuantity } from '@melonproject/token-math/quantity';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import {
  createOrder,
  signOrder,
  fillOrder,
} from '~/contracts/exchanges/thirdparty/0x';
import { make0xOrder } from './make0xOrder';
import { cancel0xOrder } from './cancel0xOrder';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';

describe('cancel0xOrder', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    shared.accounts = await shared.env.eth.getAccounts();
    shared.settings = await setupInvestedTestFund(shared.env);

    shared.zeroExAddress = shared.env.deployment.exchangeConfigs.find(
      R.propEq('name', 'ZeroEx'),
    ).exchangeAddress;

    shared.mln = getTokenBySymbol(shared.env, 'MLN');
    shared.weth = getTokenBySymbol(shared.env, 'WETH');

    const unsigned0xOrder = await createOrder(
      shared.env,
      shared.zeroExAddress,
      {
        makerAddress: shared.settings.tradingAddress,
        makerQuantity: createQuantity(shared.weth, 0.05),
        takerQuantity: createQuantity(shared.mln, 1),
      },
    );

    shared.signedOrder = await signOrder(shared.env, unsigned0xOrder);

    const result = await make0xOrder(
      shared.env,
      shared.settings.tradingAddress,
      {
        signedOrder: shared.signedOrder,
      },
    );

    expect(result).toBe(true);
  });

  // tslint:disable-next-line:max-line-length
  it('Previously made 0x order cancelled and not takeable anymore', async () => {
    const result = await cancel0xOrder(
      shared.env,
      shared.settings.tradingAddress,
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
