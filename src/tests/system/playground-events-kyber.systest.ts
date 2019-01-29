import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { getFundDetails } from '~/contracts/factory/calls/getFundDetails';
import { isShutDown } from '~/contracts/fund/hub/calls/isShutDown';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
// import { getFundHoldings } from '~/contracts/fund/accounting/calls/getFundHoldings';
// import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
// import { getAmguPrice } from '~/contracts/engine/calls/getAmguPrice';

// // import { createPrice, valueIn, add, toFixed } from '@melonproject/token-math';
// import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
// import { createToken } from '@melonproject/token-math';
// import { createQuantity } from '@melonproject/token-math';
// import { getHistoricalInvestors } from '~/contracts/fund/participation/calls/getHistoricalInvestors';
// import { getTotalAmguConsumed } from '~/contracts/engine/calls/getTotalAmguConsumed';
// import { getTotalEtherConsumed } from '~/contracts/engine/calls/getTotalEtherConsumed';
// import { getTotalMlnBurned } from '~/contracts/engine/calls/getTotalMlnBurned';
// import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
// import { getPremiumPercent } from '~/contracts/engine/calls/getPremiumPercent';
// import { getToken } from '~/contracts/dependencies/token/calls/getToken';
// import { getInfo } from '~/contracts/dependencies/token/calls/getInfo';
// import { getFundComponents } from '~/utils/getFundComponents';
// import { getInfo } from '~/contracts/dependencies/token/calls/getInfo';
import { getContract } from '~/utils/solidity/getContract';

import { Contracts } from '~/Contracts';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried('melon:protocol:systemTest:monitoring');

const capitalize = s => {
  if (typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

describe('playground', () => {
  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);
    const log = getLog(master);
    const { melonContracts } = master.deployment;

    const { engine } = melonContracts;

    const engineContract = getContract(master, Contracts.Engine, engine);

    master.eth.getBlock(1).then(b => log.debug(b));

    const engineEvents = await engineContract.getPastEvents('allEvents', {
      fromBlock: 0,
      toBlock: 'latest',
    });
    log.debug('Engine Events', engineEvents);

    // go through funds
    const fundList = await getFundDetails(
      master,
      melonContracts.ranking,
      melonContracts.version,
    );

    const contracts = [
      'accounting',
      'feeManager',
      'participation',
      'policyManager',
      // 'priceSource',
      'registry',
      'shares',
      'trading',
      'vault',
      'version',
    ];

    // const c = getContract(master, Contracts.FundFactory, melonContracts);
    // const e = await c.getPastEvents('allEvents', { fromBlock: 0, toBlock: 'latest' });
    // const events = e.map((x) => {
    //   return {
    //     event: x. event
    //   }
    // })
    // log.debug('Fund Factory Events: ', events);

    // loop through funds to get interesting quantities
    for (let i in fundList) {
      // fundList[i].components = await getFundComponents(master, fundList[i].address);
      fundList[i].isShutDown = await isShutDown(master, fundList[i].address);
      fundList[i].routes = await getRoutes(master, fundList[i].address);

      for (let j in contracts) {
        const c = getContract(
          master,
          Contracts[capitalize(contracts[j])],
          fundList[i].routes[contracts[j] + 'Address'],
        );
        const e = await c.getPastEvents('allEvents', {
          fromBlock: 0,
          toBlock: 'latest',
        });

        fundList[i][contracts[j] + 'Events'] = e.map(x => {
          return {
            event: x.event,
            // returnValues: x.returnValues,
            // timeStamp: master.eth.getBlock(x.blockNumber).then((b) => {
            //   log.debug('Timestamp: ', b.timestamp); // works
            //   return b.timestamp; // doesn't log...
            // })
          };
        });
      }
    }

    log.debug('Fund List: ', fundList);

    for (let i in fundList) {
      fundList[i].calcs = await performCalculations(
        master,
        fundList[i].routes.accountingAddress,
      );
    }

    log.debug('second fund List: ', fundList);
  });
});
