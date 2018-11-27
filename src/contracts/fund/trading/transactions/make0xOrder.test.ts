import * as R from 'ramda';
import { TokenInterface } from '@melonproject/token-math/token';

import { initTestEnvironment } from '~/utils/environment';
import { deploySystem } from '~/utils';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { createQuantity } from '@melonproject/token-math/quantity';
import { createOrder, signOrder } from '~/contracts/exchanges';
import { make0xOrder } from './make0xOrder';

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
});

test('Make 0x order from fund', async () => {
  const makerQuantity = createQuantity(shared.weth, 0.05);
  const takerQuantity = createQuantity(shared.mln, 1);

  const unsigned0xOrder = await createOrder(
    shared.zeroExAddress,
    {
      makerAddress: shared.settings.tradingAddress,
      makerQuantity,
      takerQuantity,
    },
    shared.environment,
  );

  const signedOrder = await signOrder(unsigned0xOrder, shared.environment);

  const result = await make0xOrder(
    shared.settings.tradingAddress,
    { signedOrder },
    shared.environment,
  );

  console.log(result);
});
