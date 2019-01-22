import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import {
  createQuantity,
  greaterThan,
  isEqual,
  toFixed,
  subtract,
  QuantityInterface,
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
import { makeOrderFromAccountOasisDex } from '~/contracts/exchanges/transactions/makeOrderFromAccountOasisDex';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
import { takeOasisDexOrder } from '~/contracts/fund/trading/transactions/takeOasisDexOrder';
import { makeOasisDexOrder } from '~/contracts/fund/trading/transactions/makeOasisDexOrder';
import { cancelOasisDexOrder } from '~/contracts/fund/trading/transactions/cancelOasisDexOrder';
import { shutDownFund } from '~/contracts/fund/hub/transactions/shutDownFund';
import { isShutDown } from '~/contracts/fund/hub/calls/isShutDown';
import {
  createOrder,
  approveOrder,
} from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { take0xOrder } from '~/contracts/fund/trading/transactions/take0xOrder';
import { takeOrderOnKyber } from '~/contracts/fund/trading/transactions/takeOrderOnKyber';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { allLogsWritten } from '../utils/testLogger';
import takeOrderFromAccountOasisDex from '~/contracts/exchanges/transactions/takeOrderFromAccountOasisDex';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried('melon:protocol:systemTest:playground');

describe('playground', () => {
  afterAll(async () => {
    await allLogsWritten();
  });

  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);

    const log = getLog(master);

    const { melonContracts } = master.deployment;

    const matchingMarket =
      master.deployment.exchangeConfigs[Exchanges.MatchingMarket].exchange;

    const manager = await withNewAccount(master);
    const trader = await withNewAccount(master);

    const weth = getTokenBySymbol(manager, 'WETH');
    const mln = getTokenBySymbol(manager, 'MLN');

    try {
      const mlnPrice = await getPrice(
        master,
        melonContracts.priceSource.toString(),
        mln,
      );

      log.debug('MLN Price', mlnPrice);
    } catch (e) {
      throw new Error('Cannot get MLN Price from Kyber');
    }

    const masterBalance = await getBalance(master);

    expect(masterBalance).toBeTrueWith(
      greaterThan,
      createQuantity(masterBalance.token, 6),
    );

    await sendEth(master, {
      howMuch: createQuantity('ETH', 2),
      to: manager.wallet.address,
    });

    await sendEth(master, {
      howMuch: createQuantity('ETH', 1),
      to: trader.wallet.address,
    });

    await transfer(master, {
      howMuch: createQuantity(mln, 10),
      to: trader.wallet.address,
    });

    const quantity = createQuantity(weth, 1);

    await deposit(manager, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const routes = await setupInvestedTestFund(manager);

    const preCalculations = await performCalculations(
      manager,
      routes.accountingAddress,
    );

    log.debug({ preCalculations });

    log.debug(
      'After first investment, share price is: ',
      toFixed(preCalculations.sharePrice),
    );

    const orderFromFund = await makeOasisDexOrder(
      manager,
      routes.tradingAddress,
      {
        makerQuantity: createQuantity(weth, 0.5),
        takerQuantity: createQuantity(mln, 8),
      },
    );

    log.debug('Fund made an order ', orderFromFund);

    const takeOrderFromTrader = await takeOrderFromAccountOasisDex(
      trader,
      matchingMarket,
      {
        id: orderFromFund.id,
        buy: orderFromFund.buy,
        sell: orderFromFund.sell,
        maxTakeAmount: createQuantity(weth, 0.5),
      },
    );

    log.debug('Trader took the order: ', takeOrderFromTrader);
  });
});
