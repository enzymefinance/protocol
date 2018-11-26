import * as R from 'ramda';
import { initTestEnvironment } from '~/utils/environment';
import { deploySystem } from '~/utils';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';
import { createOrder, signOrder, approveOrder } from '~/contracts/exchanges';
import { take0xOrder } from './take0xOrder';
import { TokenInterface } from '@melonproject/token-math/token';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';

const shared: any = {};

export const getTokenBySymbol = (tokens: TokenInterface[], symbol: string) =>
  R.find(R.propEq('symbol', symbol), tokens);

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
  // shared.environmentNotManager = withDifferentAccount(
  //   shared.accounts[1],
  //   shared.environment,
  // );

  const deployment = await deploySystem();

  shared.settings = await setupInvestedTestFund(deployment);

  shared.zeroExAddress = deployment.exchangeConfigs.find(
    R.propEq('name', 'ZeroEx'),
  ).exchangeAddress;

  shared.mln = getTokenBySymbol(deployment.tokens, 'MLN');
  shared.weth = getTokenBySymbol(deployment.tokens, 'WETH');

  const makerQuantity = createQuantity(shared.mln, 1);
  const takerQuantity = createQuantity(shared.weth, 0.05);

  const unsigned0xOrder = await createOrder(
    shared.zeroExAddress,
    {
      makerQuantity,
      takerQuantity,
    },
    shared.environment,
  );

  shared.signedOrder = await signOrder(unsigned0xOrder, shared.environment);
  await approveOrder(
    shared.zeroExAddress,
    shared.signedOrder,
    shared.environment,
  );
});

test('Take off-chain order from fund', async () => {
  // console.log(shared.signedOrder);
  const takerQuantity = createQuantity(shared.weth, 0.02);

  const order = await take0xOrder(shared.settings.tradingAddress, {
    signedOrder: shared.signedOrder,
    takerQuantity,
  });

  expect(isEqual(order.takerFilledAmount, takerQuantity)).toBe(true);
});
