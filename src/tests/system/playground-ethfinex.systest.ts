import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import {
  createQuantity,
  greaterThan,
  isEqual,
  subtract,
  QuantityInterface,
  toFixed,
} from '@melonproject/token-math';
import { sendEth } from '~/utils/evm/sendEth';
import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';

import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { updateKyber } from '~/contracts/prices/transactions/updateKyber';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import { Exchanges } from '~/Contracts';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
import { shutDownFund } from '~/contracts/fund/hub/transactions/shutDownFund';
import { isShutDown } from '~/contracts/fund/hub/calls/isShutDown';
import {
  createOrder,
  approveOrder,
} from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { take0xOrder } from '~/contracts/fund/trading/transactions/take0xOrder';
import { makeEthfinexOrder } from '~/contracts/fund/trading/transactions/makeEthfinexOrder';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried('melon:protocol:systemTest:playground');

describe('playground', () => {
  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);

    const log = getLog(master);

    const { melonContracts } = master.deployment;
    const manager = await withNewAccount(master);
    const weth = getTokenBySymbol(manager, 'WETH');
    const mln = getTokenBySymbol(manager, 'MLN');

    await sendEth(master, {
      howMuch: createQuantity('ETH', 2),
      to: manager.wallet.address,
    });

    const quantity = createQuantity(weth, 1);

    await deposit(manager, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const routes = await setupInvestedTestFund(manager);

    const ethfinex =
      manager.deployment.exchangeConfigs[Exchanges.Ethfinex].exchange;

    const howMuch = createQuantity(weth, 1);

    const receipt = await transfer(master, {
      howMuch,
      to: routes.vaultAddress,
    });

    expect(receipt).toBeTruthy();

    const makerQuantity = createQuantity(weth, 0.05);
    const takerQuantity = createQuantity(mln, 1);

    const unsignedEthfinexOrder = await createOrder(manager, ethfinex, {
      makerAddress: routes.tradingAddress,
      makerQuantity,
      takerQuantity,
    });

    const signedOrder = await signOrder(manager, unsignedEthfinexOrder);

    const result = await makeEthfinexOrder(manager, routes.tradingAddress, {
      signedOrder,
    });
  });
});
