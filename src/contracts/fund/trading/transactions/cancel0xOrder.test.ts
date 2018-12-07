import * as R from 'ramda';
import { TokenInterface } from '@melonproject/token-math/token';
import { createQuantity } from '@melonproject/token-math/quantity';

import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import {
  createOrder,
  signOrder,
  fillOrder,
} from '~/contracts/exchanges/thirdparty/0x';

import { make0xOrder } from './make0xOrder';
import { cancel0xOrder } from './cancel0xOrder';

const shared: any = {};

export const getTokenBySymbol = (tokens: TokenInterface[], symbol: string) =>
  R.find(R.propEq('symbol', symbol), tokens);

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared.accounts = await shared.env.eth.getAccounts();

  const deployment = await deploySystem(shared.env);

  shared.settings = await setupInvestedTestFund(shared.env, deployment);

  shared.zeroExAddress = deployment.exchangeConfigs.find(
    R.propEq('name', 'ZeroEx'),
  ).exchangeAddress;

  shared.mln = getTokenBySymbol(deployment.tokens, 'MLN');
  shared.weth = getTokenBySymbol(deployment.tokens, 'WETH');

  const unsigned0xOrder = await createOrder(shared.env, shared.zeroExAddress, {
    makerAddress: shared.settings.tradingAddress,
    makerQuantity: createQuantity(shared.weth, 0.05),
    takerQuantity: createQuantity(shared.mln, 1),
  });

  shared.signedOrder = await signOrder(shared.env, unsigned0xOrder);

  const result = await make0xOrder(shared.env, shared.settings.tradingAddress, {
    signedOrder: shared.signedOrder,
  });

  expect(result).toBe(true);
});

// tslint:disable-next-line:max-line-length
test('Previously made 0x order cancelled and not takeable anymore', async () => {
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
