import {
  createQuantity,
  greaterThan,
  isEqual,
} from '@melonproject/token-math/quantity';
import { createPrice } from '@melonproject/token-math/price';

import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import { sendEth } from '~/utils/evm/sendEth';
import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';
import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { update } from '~/contracts/prices/transactions/update';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { toBeTrueWith } from '../utils/toBeTrueWith';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { Exchanges } from '~/Contracts';
import { makeOrderFromAccountOasisDex } from '~/contracts/exchanges/transactions/makeOrderFromAccountOasisDex';
import { takeOasisDexOrder } from '~/contracts/fund/trading/transactions/takeOasisDexOrder';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { allLogsWritten } from '../utils/testLogger';
import { Tracks } from '~/utils/environment/Environment';
import {
  createOrder,
  approveOrder,
} from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { take0xOrder } from '~/contracts/fund/trading/transactions/take0xOrder';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried('melon:protocol:systemTest:playground');

describe('playground', () => {
  afterAll(async () => {
    await allLogsWritten();
  });

  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.TESTING);

    const log = getLog(master);

    const { melonContracts } = master.deployment;

    const matchingMarket =
      master.deployment.exchangeConfigs[Exchanges.MatchingMarket].exchange;

    const zeroEx = master.deployment.exchangeConfigs[Exchanges.ZeroEx].exchange;

    const manager = await withNewAccount(master);
    const trader = await withNewAccount(master);

    const amguToken = await getAmguToken(master, melonContracts.version);
    const amguPrice = createQuantity(amguToken, '1000000000');
    await setAmguPrice(master, melonContracts.engine, amguPrice);

    const weth = getTokenBySymbol(manager, 'WETH');
    const mln = getTokenBySymbol(manager, 'MLN');

    await update(master, melonContracts.priceSource, [
      createPrice(createQuantity(weth, 1), createQuantity(weth, 1)),
      createPrice(createQuantity(mln, 1), createQuantity(weth, 0.05)),
    ]);

    const mlnPrice = await getPrice(
      master,
      melonContracts.priceSource.toString(),
      amguToken,
    );

    log.debug('MLN Price', mlnPrice);

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

    const order = await makeOrderFromAccountOasisDex(trader, matchingMarket, {
      buy: createQuantity(weth, 0.1),
      sell: createQuantity(mln, 1),
    });

    const routes = await setupInvestedTestFund(manager);

    const preCalculations = await performCalculations(
      manager,
      routes.accountingAddress,
    );

    log.debug({ preCalculations });

    await takeOasisDexOrder(manager, routes.tradingAddress, {
      id: order.id,
      maker: order.maker,
      makerQuantity: order.sell,
      takerQuantity: order.buy,
    });

    const calculations = await performCalculations(
      manager,
      routes.accountingAddress,
    );

    log.debug({ calculations });

    expect(calculations.gav).toBeTrueWith(isEqual, createQuantity(weth, 0.95));

    const unsignedZeroExOrder = await createOrder(trader, zeroEx, {
      makerQuantity: createQuantity(mln, 0.75),
      takerQuantity: createQuantity(weth, 0.075),
    });
    const signedZeroExOrder = await signOrder(trader, unsignedZeroExOrder);
    await approveOrder(trader, zeroEx, signedZeroExOrder);

    const filledOrder = await take0xOrder(manager, routes.tradingAddress, {
      signedOrder: signedZeroExOrder,
    });

    expect(filledOrder.makerFilledAmount).toBeTrueWith(
      isEqual,
      createQuantity(mln, 0.75),
    );
  });
});
