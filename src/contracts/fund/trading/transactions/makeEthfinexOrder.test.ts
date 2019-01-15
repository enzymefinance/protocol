import { createQuantity } from '@melonproject/token-math';

import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { makeEthfinexOrder } from './makeEthfinexOrder';
import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { Exchanges } from '~/Contracts';
import { getWrapperLock } from '~/contracts/exchanges/third-party/ethfinex/calls/getWrapperLock';
import { setEthfinexWrapperRegistry } from '~/contracts/version/transactions/setEthfinexWrapperRegistry';
import { getHub } from '../../hub/calls/getHub';
import { getRoutes } from '../../hub/calls/getRoutes';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { createOrder } from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { fillOrder } from '~/contracts/exchanges/third-party/0x/transactions/fillOrder';

const shared: any = {};

beforeAll(async () => {
  const env = await deployAndInitTestEnv();
  const registry = env.deployment.melonContracts.registry;
  const wrapperRegistryEFX =
    env.deployment.thirdPartyContracts.exchanges.ethfinex.wrapperRegistryEFX;

  shared.env = env;
  shared.accounts = await env.eth.getAccounts();
  shared.routes = await setupInvestedTestFund(env);
  shared.ethfinexAddress =
    env.deployment.exchangeConfigs[Exchanges.Ethfinex].exchange;

  await setEthfinexWrapperRegistry(env, registry, {
    address: wrapperRegistryEFX,
  });

  shared.mln = getTokenBySymbol(env, 'MLN');
  shared.weth = getTokenBySymbol(env, 'WETH');
  shared.zx = getTokenBySymbol(env, 'ZRX');

  shared.mlnWrapperLock = await getWrapperLock(env, wrapperRegistryEFX, {
    token: shared.mln,
  });

  shared.wethWrapperLock = await getWrapperLock(env, wrapperRegistryEFX, {
    token: shared.weth,
  });

  shared.zxWrapperLock = await getWrapperLock(env, wrapperRegistryEFX, {
    token: shared.zx,
  });
});

// tslint:disable-next-line:max-line-length
test('Make ethfinex order from fund and take it from account in which makerToken is a non-native asset', async () => {
  const hubAddress = await getHub(shared.env, shared.routes.tradingAddress);
  const { vaultAddress } = await getRoutes(shared.env, hubAddress);
  const howMuch = createQuantity(shared.zx, 1);

  const receipt = await transfer(shared.env, { howMuch, to: vaultAddress });
  expect(receipt).toBeTruthy();

  const makerQuantity = createQuantity(shared.zxWrapperLock, 0.05);
  const takerQuantity = createQuantity(shared.mln, 1);

  const unsignedEthfinexOrder = await createOrder(
    shared.env,
    shared.ethfinexAddress,
    {
      makerAddress: shared.routes.tradingAddress,
      makerQuantity,
      takerQuantity,
    },
  );

  const signedOrder = await signOrder(shared.env, unsignedEthfinexOrder);

  const result = await makeEthfinexOrder(
    shared.env,
    shared.routes.tradingAddress,
    { signedOrder },
  );

  expect(result).toBe(true);

  const filled = await fillOrder(shared.env, shared.ethfinexAddress, {
    signedOrder,
  });

  expect(filled).toBeTruthy();
});
