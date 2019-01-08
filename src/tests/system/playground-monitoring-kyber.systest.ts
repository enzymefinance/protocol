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
import { isShutDown } from '~/contracts/fund/hub/calls/isShutDown';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { getFundHoldings } from '~/contracts/fund/accounting/calls/getFundHoldings';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';

// import * as coinbase from './.coinbase.json';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried('melon:protocol:systemTest:monitoring');

describe('playground', () => {
  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);

    const log = getLog(master);

    const { melonContracts } = master.deployment;

    const manager = await withNewAccount(master);
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

    // fund list

    let fundList = await getFundDetails(
      master,
      melonContracts.ranking,
      melonContracts.version,
    );

    log.debug('list : ', fundList);

    let numberOfFunds = {
      active: 0,
      inActive: 0,
      total: 0,
    };

    // loop through funds to get interesting quantities
    for (let i in fundList) {
      fundList[i].isShutDown = await isShutDown(master, fundList[i].address);
      fundList[i].routes = await getRoutes(master, fundList[i].address);
      fundList[i].holdings = await getFundHoldings(
        master,
        fundList[i].routes.accountingAddress,
      );
      fundList[i].calcs = await performCalculations(
        master,
        fundList[i].routes.accountingAddress,
      );
    }

    // Number of funds (active, inactive, total)
    numberOfFunds.active = fundList.filter(f => {
      return f.isShutDown === false;
    }).length;
    log.debug('Active funds: ', numberOfFunds.active);

    numberOfFunds.inActive = fundList.filter(f => {
      return f.isShutDown === true;
    }).length;
    log.debug('Inactive funds: ', numberOfFunds.inActive);

    log.debug('Modified fund list', fundList);

    // random stuff so that everything before runs and logs correctly
    let fundList2 = await getFundDetails(
      master,
      melonContracts.ranking,
      melonContracts.version,
    );

    log.debug('list 2 : ', fundList2);
  });
});
