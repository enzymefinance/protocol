import { createQuantity } from '@melonproject/token-math';

import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { allLogsWritten } from '../utils/testLogger';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

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

    const mln = getTokenBySymbol(master, 'MLN');
    const weth = getTokenBySymbol(master, 'WETH');

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

    const fundToken = await getToken(
      master,
      '0x289e7bcb82b8b386ed0317ee48bade3dc3ec0c82',
    );
    const requestedShares = createQuantity(fundToken, 0.5);

    const request = await requestInvestment(
      master,
      '0x1a931c810800bd15f63b32c22625cd1e46fd835b',
      {
        investmentAmount: createQuantity(weth, 0.5),
        requestedShares,
      },
    );
    log.debug('Request', request);
  });
});
