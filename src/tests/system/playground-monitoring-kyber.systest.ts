import { getBalance } from '~/utils/evm/getBalance';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import { createQuantity, greaterThan } from '@melonproject/token-math/quantity';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { getFundDetails } from '~/contracts/factory/calls/getFundDetails';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried('melon:protocol:systemTest:monitoring');

describe('playground', () => {
  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);

    const log = getLog(master);

    const { melonContracts } = master.deployment;

    const manager = withNewAccount(master);
    console.log('Manager address is: ', manager.wallet.address);

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
    const fundList = await getFundDetails(
      master,
      melonContracts.ranking,
      melonContracts.version,
    );
    console.log('List: ', fundList);

    log.debug('list : ', fundList);
  });
});
