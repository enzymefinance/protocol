import * as R from 'ramda';
import { createQuantity } from '@melonproject/token-math/quantity';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { deploySystem } from '~/utils/deploySystem';
import {
  createOrder,
  signOrder,
  fillOrder,
} from '~/contracts/exchanges/thirdparty/0x';
import { make0xOrder } from './make0xOrder';

describe('make0xOrder', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await deploySystem(await initTestEnvironment());
    shared.accounts = await shared.env.eth.getAccounts();
    shared.settings = await setupInvestedTestFund(shared.env);

    shared.zeroExAddress = shared.env.deployment.exchangeConfigs.find(
      R.propEq('name', 'ZeroEx'),
    ).exchangeAddress;

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
