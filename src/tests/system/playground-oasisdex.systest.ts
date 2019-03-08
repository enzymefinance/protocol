import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import { createQuantity, greaterThan, toFixed } from '@melonproject/token-math';
import { sendEth } from '~/utils/evm/sendEth';
import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';

import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { Exchanges } from '~/Contracts';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
import { makeOasisDexOrder } from '~/contracts/fund/trading/transactions/makeOasisDexOrder';

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

    const matchingMarket =
      master.deployment.exchangeConfigs[Exchanges.MatchingMarket].exchange;

    const manager = await withNewAccount(master);
    const trader = await withNewAccount(master);

    const weth = getTokenBySymbol(manager, 'WETH');
    const mln = getTokenBySymbol(manager, 'MLN');

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
