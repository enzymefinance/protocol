import * as R from 'ramda';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';
import { take0xOrder } from './take0xOrder';
import { TokenInterface } from '@melonproject/token-math/token';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import {
  createOrder,
  signOrder,
  approveOrder,
} from '~/contracts/exchanges/thirdparty/0x';

const shared: any = {};

export const getTokenBySymbol = (tokens: TokenInterface[], symbol: string) =>
  R.find(R.propEq('symbol', symbol), tokens);

beforeAll(async () => {
  shared.env = await deploySystem(await initTestEnvironment());
  shared.accounts = await shared.env.eth.getAccounts();
  // shared.envNotManager = withDifferentAccount(
  //   shared.accounts[1],
  //   shared.env,
  // );

  shared.settings = await setupInvestedTestFund(shared.env);
  shared.zeroExAddress = shared.env.deployment.exchangeConfigs.find(
    R.propEq('name', 'ZeroEx'),
  ).exchangeAddress;

  shared.mln = getTokenBySymbol(shared.env.deployment.tokens, 'MLN');
  shared.weth = getTokenBySymbol(shared.env.deployment.tokens, 'WETH');

  const makerQuantity = createQuantity(shared.mln, 1);
  const takerQuantity = createQuantity(shared.weth, 0.05);

  const unsigned0xOrder = await createOrder(shared.env, shared.zeroExAddress, {
    makerQuantity,
    takerQuantity,
  });

  shared.signedOrder = await signOrder(shared.env, unsigned0xOrder);
  await approveOrder(shared.env, shared.zeroExAddress, shared.signedOrder);
});

test('Take off-chain order from fund', async () => {
  const takerQuantity = createQuantity(shared.weth, 0.02);

  const order = await take0xOrder(shared.env, shared.settings.tradingAddress, {
    signedOrder: shared.signedOrder,
    takerQuantity,
  });

  expect(isEqual(order.takerFilledAmount, takerQuantity)).toBe(true);
});
