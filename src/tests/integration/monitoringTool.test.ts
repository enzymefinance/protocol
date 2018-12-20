import * as R from 'ramda';
import * as path from 'path';

import { createQuantity } from '@melonproject/token-math/quantity';

import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import { getAmguPrice } from '~/contracts/engine/calls/getAmguPrice';

import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';

import axios from 'axios';

import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';
// import { version } from 'ethers';
// import { last } from 'rxjs/operators';
import { getFundHoldings } from '~/contracts/fund/accounting/calls/getFundHoldings';
// import { getTokenByAddress } from '~/utils/environment/getTokenByAddress';
// import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { deployAndInitTestEnv } from '../utils/deployAndInitTestEnv';
import { getFundDetails } from '~/contracts/factory/calls/getFundDetails';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
import { isShutDown } from '~/contracts/fund/hub/calls/isShutDown';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { withNewAccount } from '~/utils/environment/withNewAccount';
import { getBalance } from '~/utils/evm/getBalance';
import { sendEth } from '~/utils/evm/sendEth';
import { withDeployment } from '~/utils/environment/withDeployment';
import { withKeystoreSigner } from '~/utils/environment/withKeystoreSigner';
import { constructEnvironment } from '~/utils/environment/constructEnvironment';
import { testLogger } from '../utils/testLogger';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getAllBalances } from '../utils/getAllBalances';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { executeRequest } from '~/contracts/fund/participation/transactions/executeRequest';

describe('monitoringTool', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    shared.accounts = await shared.env.eth.getAccounts();
    // console.log('Accounts: ', shared.accounts);
    // shared.envNotManager = await withDifferentAccount(
    //   shared.accounts[1],
    //   shared.env,
    // );

    // console.log('EnvNotManager: ', shared.envNotManager);
  });

  // test('Set and get amgu', async () => {
  //   // const debug = shared.env.logger('melon:protocol:utils', LogLevels.DEBUG);
  //   // const fundName = `test-fund-${randomString()}`;

  //   const {
  //     // exchangeConfigs,
  //     melonContracts,
  //     // thirdPartyContracts,
  //   } = shared.env.deployment;

  //   const { version, engine } = melonContracts;

  //   // amgu Price
  //   // const tokens = thirdPartyContracts.tokens;

  //   // const [quoteToken, baseToken] = tokens;
  //   // const defaultTokens = [quoteToken, baseToken];
  //   const amguToken = await getAmguToken(shared.env, version);
  //   const amguPrice = createQuantity(amguToken, '1000000000');
  //   await setAmguPrice(shared.env, engine, amguPrice);
  //   const myAmguPrice = await getAmguPrice(shared.env, engine);

  //   // console.log(
  //   //   'Amgu Price: ',
  //   //   myAmguPrice.quantity.value,
  //   //   ' ',
  //   //   myAmguPrice.token.symbol,
  //   // );

  // });

  // test('Read exchange rates', async () => {
  //   // exchange rates
  //   let rates = {
  //     ETHMLN: 0,
  //     MLNUSD: 0,
  //     ETHUSD: 0,
  //   };

  //   let axinst = axios.create({
  //     baseURL: 'https://rest.coinapi.io',
  //     headers: { 'X-CoinAPI-Key': '6F388926-927B-4582-AE90-B1C8CD3D5B60' },
  //   });

  //   const getRate = async (a, b) => {
  //     try {
  //       const response = await axinst.get('/v1/exchangerate/' + a + '/' + b);
  //       return response.data;
  //     } catch (error) {
  //       console.error(error);
  //     }
  //   };

  //   for (let [key] of Object.entries(rates)) {
  //     let a = key.substr(0, 3);
  //     let b = key.substr(3, 3);

  //     rates[key] = await getRate(a, b);
  //     // console.log(key + ': ', rates[key]);
  //   }

  // });

  test('Reading fund list', async () => {
    const {
      // exchangeConfigs,
      melonContracts,
      thirdPartyContracts,
    } = shared.env.deployment;

    const { version, ranking } = melonContracts;

    const [weth, mln] = thirdPartyContracts.tokens;

    // setup fund
    const fundAddress = await setupInvestedTestFund(shared.env);
    console.log('Fund: ', fundAddress);

    const investmentAmount = createQuantity(weth, 1);

    await approve(shared.env, {
      howMuch: investmentAmount,
      spender: fundAddress.participationAddress,
    });

    await requestInvestment(shared.env, fundAddress.participationAddress, {
      investmentAmount,
    });

    await executeRequest(shared.env, fundAddress.participationAddress);

    const fundHoldings = await getFundHoldings(
      shared.env,
      fundAddress.accountingAddress,
    );
    console.log('Fund holdings: ', fundHoldings, '\n\n\n');

    const hub = await getHub(shared.env, fundAddress.accountingAddress);
    console.log('Hub: ', hub);

    // second fund

    const env2 = await withDifferentAccount(shared.env, shared.accounts[2]);

    const balance = await getBalance(shared.env);
    console.log('Balance: ', balance);

    await sendEth(shared.env, {
      howMuch: createQuantity(weth, 5),
      to: env2.wallet.address,
    });

    const b2 = await getBalance(env2);
    console.log('Balance 2: ', b2);

    const fund2 = await setupInvestedTestFund(env2);
    console.log('2nd Fund: ', fund2);

    const investmentAmount2 = createQuantity(weth, 1);

    await approve(shared.env, {
      howMuch: investmentAmount2,
      spender: fund2.participationAddress,
    });

    await requestInvestment(shared.env, fund2.participationAddress, {
      investmentAmount,
    });

    await executeRequest(shared.env, fund2.participationAddress);

    const hub2 = await getHub(shared.env, fund2.accountingAddress);
    console.log('Hub: ', hub2);

    // get fund list
    const fundList = await getFundDetails(shared.env, ranking, version);
    console.log('List: ', fundList);

    // loop through funds to get interesting quantities
    for (let f of fundList) {
      let shutDown = await isShutDown(shared.env, f.address);
      console.log('Is Shut Down: ', shutDown);

      let routes = await getRoutes(shared.env, f.address);
      console.log('Route: ', routes);
      console.log('Accounting address: ', routes.accountingAddress);

      let holdings = await getFundHoldings(
        shared.env,
        routes.accountingAddress,
      );
      console.log('Holdings: ', holdings);

      let calcs = await performCalculations(
        shared.env,
        routes.accountingAddress,
      );
      console.log('Calculations: ', calcs);
    }

    // console.log('Share price: ', fundList[0].sharePrice.base, fundList[0].sharePrice.quote)
  });
});
