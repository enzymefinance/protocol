import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import { createQuantity, greaterThan } from '@melonproject/token-math';
import { sendEth } from '~/utils/evm/sendEth';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { allLogsWritten } from '../utils/testLogger';
import { setupFund } from '~/contracts/fund/hub/transactions/setupFund';
import { getExchangesInfo } from '~/contracts/factory/calls/getExchangesInfo';
import { getExchangeInfo } from '~/contracts/fund/trading/calls/getExchangeInfo';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried(
  'melon:protocol:systemTest:playground-multiple-investors',
);

describe('playground', () => {
  afterAll(async () => {
    await allLogsWritten();
  });

  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);

    const log = getLog(master);

    const { melonContracts } = master.deployment;

    const manager = await withNewAccount(master);

    log.debug('Manager ', manager.wallet.address);

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
      howMuch: createQuantity('ETH', 100),
      to: manager.wallet.address,
    });

    const routes = await setupFund(manager);

    log.debug('Routes ', routes);

    const tradingInfo = await getExchangesInfo(
      manager,
      melonContracts.version,
      manager.wallet.address,
    );

    log.debug('Data from Fund Factory ', tradingInfo);

    const exchangeInfo = await getExchangeInfo(manager, routes.tradingAddress);

    log.debug('Data from trading contract ', exchangeInfo);
  });
});
