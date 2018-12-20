import * as R from 'ramda';
import { TokenInterface } from '@melonproject/token-math/token';
import { createQuantity } from '@melonproject/token-math/quantity';

import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import { getHub } from '../../hub/calls/getHub';
import { getSettings } from '../../hub/calls/getSettings';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { getWrapperLock } from '~/contracts/exchanges/thirdparty/ethfinex/calls/getWrapperLock';
import { Exchanges } from '~/Contracts';
import {
  createOrder,
  signOrder,
  fillOrder,
} from '~/contracts/exchanges/thirdparty/0x';

import { makeEthfinexOrder } from './makeEthfinexOrder';
import { cancelEthfinexOrder } from './cancelEthfinexOrder';

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
  shared.mlnWrapperLock = await getWrapperLock(shared.ethfinexAddress, {
    token: shared.mln,
  });

  shared.zx = getTokenBySymbol(deployment.tokens, 'ZRX');
  shared.zxWrapperLock = await getWrapperLock(shared.ethfinexAddress, {
    token: shared.zx,
  });

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

  shared.signedOrder = await signOrder(
    unsignedEthfinexOrder,
    shared.environment,
  );

  const result = await makeEthfinexOrder(
    shared.settings.tradingAddress,
    { signedOrder: shared.signedOrder },
    shared.environment,
  );

  expect(result).toBe(true);
});

// tslint:disable-next-line:max-line-length
test('Previously made ethfinex order cancelled and not takeable anymore', async () => {
  const result = await cancelEthfinexOrder(
    shared.settings.tradingAddress,
    { signedOrder: shared.signedOrder },
    shared.environment,
  );

  expect(result).toBe(true);

  await expect(
    fillOrder(
      shared.ethfinexAddress,
      {
        signedOrder: shared.signedOrder,
      },
      shared.environment,
    ),
  ).rejects.toThrow('CANCELLED');
});
