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
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();

  const deployment = await deploySystem();

  shared.settings = await setupInvestedTestFund(deployment);

  shared.zeroExAddress = deployment.exchangeConfigs.find(
    R.propEq('name', 'ZeroEx'),
  ).exchangeAddress;

  shared.mln = getTokenBySymbol(deployment.tokens, 'MLN');
  shared.weth = getTokenBySymbol(deployment.tokens, 'WETH');

  const unsigned0xOrder = await createOrder(
    shared.zeroExAddress,
    {
      makerAddress: shared.settings.tradingAddress,
      makerQuantity: createQuantity(shared.weth, 0.05),
      takerQuantity: createQuantity(shared.mln, 1),
    },
    shared.environment,
  );

  shared.signedOrder = await signOrder(unsigned0xOrder, shared.environment);

  const result = await make0xOrder(
    shared.settings.tradingAddress,
    { signedOrder: shared.signedOrder },
    shared.environment,
  );

  expect(result).toBe(true);
});

// tslint:disable-next-line:max-line-length
test('Previously made 0x order cancelled and not takeable anymore', async () => {
  const result = await cancel0xOrder(
    shared.settings.tradingAddress,
    { signedOrder: shared.signedOrder },
    shared.environment,
  );

  expect(result).toBe(true);

  await expect(
    fillOrder(
      shared.zeroExAddress,
      {
        signedOrder: shared.signedOrder,
      },
      shared.environment,
    ),
  ).rejects.toThrow('CANCELLED');
});
