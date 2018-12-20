import * as R from 'ramda';
import { TokenInterface } from '@melonproject/token-math/token';
import { createQuantity } from '@melonproject/token-math/quantity';

// tslint:disable:max-line-length
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import {
  createOrder,
  signOrder,
  fillOrder,
} from '~/contracts/exchanges/thirdparty/0x';

import { makeEthfinexOrder } from './makeEthfinexOrder';
import { Exchanges } from '~/Contracts';
import { getWrapperLock } from '~/contracts/exchanges/thirdparty/ethfinex/calls/getWrapperLock';
import { getHub } from '../../hub/calls/getHub';
import { getSettings } from '../../hub/calls/getSettings';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
// tslint:enable:max-line-length

const shared: any = {};

export const getTokenBySymbol = (tokens: TokenInterface[], symbol: string) =>
  R.find(R.propEq('symbol', symbol), tokens);

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();

  const deployment = await deploySystem();

  shared.settings = await setupInvestedTestFund(deployment);

  shared.ethfinexAddress = deployment.exchangeConfigs.find(
    R.propEq('name', Exchanges.Ethfinex),
  ).exchangeAddress;

  shared.mln = getTokenBySymbol(deployment.tokens, 'MLN');
  shared.weth = getTokenBySymbol(deployment.tokens, 'WETH');
  shared.zx = getTokenBySymbol(deployment.tokens, 'ZRX');

  shared.mlnWrapperLock = await getWrapperLock(shared.ethfinexAddress, {
    token: shared.mln,
  });

  shared.wethWrapperLock = await getWrapperLock(shared.ethfinexAddress, {
    token: shared.weth,
  });

  shared.zxWrapperLock = await getWrapperLock(shared.ethfinexAddress, {
    token: shared.zx,
  });
});

test('Make ethfinex order from fund and take it from account in which makerToken is a non-native asset', async () => {
  const hubAddress = await getHub(
    shared.settings.tradingAddress,
    shared.environment,
  );
  const { vaultAddress } = await getSettings(hubAddress);
  const howMuch = createQuantity(shared.zx, 1);

  const receipt = await transfer({ howMuch, to: vaultAddress });
  expect(receipt).toBeTruthy();

  const makerQuantity = createQuantity(shared.zxWrapperLock, 0.05);
  const takerQuantity = createQuantity(shared.mln, 1);

  const unsignedEthfinexOrder = await createOrder(
    shared.ethfinexAddress,
    {
      makerAddress: shared.settings.tradingAddress,
      makerQuantity,
      takerQuantity,
    },
    shared.environment,
  );

  const signedOrder = await signOrder(
    unsignedEthfinexOrder,
    shared.environment,
  );

  const result = await makeEthfinexOrder(
    shared.settings.tradingAddress,
    { signedOrder },
    shared.environment,
  );

  expect(result).toBe(true);

  const filled = await fillOrder(
    shared.ethfinexAddress,
    {
      signedOrder,
    },
    shared.environment,
  );

  expect(filled).toBeTruthy();
});
