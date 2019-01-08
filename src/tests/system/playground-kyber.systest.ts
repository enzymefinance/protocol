import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import { createQuantity, greaterThan } from '@melonproject/token-math/quantity';
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
import { toFixed } from '@melonproject/token-math/price';
import { makeOasisDexOrder } from '~/contracts/fund/trading/transactions/makeOasisDexOrder';
import { cancelOasisDexOrder } from '~/contracts/fund/trading/transactions/cancelOasisDexOrder';
import { shutDownFund } from '~/contracts/fund/hub/transactions/shutDownFund';
import { isShutDown } from '~/contracts/fund/hub/calls/isShutDown';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried('melon:protocol:systemTest:playground');

describe('playground', () => {
  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);

    const log = getLog(master);

    const { melonContracts } = master.deployment;

    const matchingMarket =
      master.deployment.exchangeConfigs[Exchanges.MatchingMarket].exchange;

    const manager = await withNewAccount(master);
    const trader = await withNewAccount(master);

    const amguPrice = createQuantity('MLN', '1000000000');
    await setAmguPrice(master, melonContracts.engine, amguPrice);
    await updateKyber(master, melonContracts.priceSource);

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
      howMuch: createQuantity(mln, 2),
      to: trader.wallet.address,
    });

    const quantity = createQuantity(weth, 1);

    await deposit(manager, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const orderFromTrader = await makeOrderFromAccountOasisDex(
      trader,
      matchingMarket,
      {
        buy: createQuantity(weth, 0.1),
        sell: createQuantity(mln, 1),
      },
    );

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

    expect(toFixed(preCalculations.sharePrice)).toEqual('1.000000');

    const orderFromFund = await makeOasisDexOrder(
      manager,
      routes.tradingAddress,
      {
        makerQuantity: createQuantity(weth, 0.5),
        takerQuantity: createQuantity(mln, 8),
      },
    );

    log.debug('Made an order ', orderFromFund);

    let calculations = await performCalculations(
      manager,
      routes.accountingAddress,
    );

    expect(toFixed(calculations.sharePrice)).toEqual('1.000000');

    await cancelOasisDexOrder(manager, routes.tradingAddress, {
      id: orderFromFund.id,
      maker: orderFromFund.maker,
      makerAsset: orderFromFund.sell.token.address,
      takerAsset: orderFromFund.buy.token.address,
    });

    log.debug('Canceled order ', orderFromFund.id);

    await takeOasisDexOrder(manager, routes.tradingAddress, {
      id: orderFromTrader.id,
      maker: orderFromTrader.maker,
      makerQuantity: orderFromTrader.sell,
      takerQuantity: orderFromTrader.buy,
    });

    calculations = await performCalculations(manager, routes.accountingAddress);

    log.debug(
      'After taking an order, share price is: ',
      toFixed(calculations.sharePrice),
    );
    log.debug({ calculations });

    expect(calculations.gav).toBeTrueWith(
      greaterThan,
      createQuantity(weth, 0.8),
    );

    await shutDownFund(manager, melonContracts.version, {
      hub: routes.hubAddress,
    });
    log.debug('Shut down fund');

    const isFundShutDown = await isShutDown(manager, routes.hubAddress);

    expect(isFundShutDown).toBeTruthy();
  });
});
