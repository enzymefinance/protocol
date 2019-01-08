// import * as R from 'ramda';
// import * as path from 'path';

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
// import { withNewAccount } from '~/utils/environment/withNewAccount';
import { getBalance } from '~/utils/evm/getBalance';
import { sendEth } from '~/utils/evm/sendEth';
// import { withDeployment } from '~/utils/environment/withDeployment';
// import { withKeystoreSigner } from '~/utils/environment/withKeystoreSigner';
// import { constructEnvironment } from '~/utils/environment/constructEnvironment';
// import { testLogger } from '../utils/testLogger';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
// import { getAllBalances } from '../utils/getAllBalances';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { executeRequest } from '~/contracts/fund/participation/transactions/executeRequest';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

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

  test('Set and get amgu', async () => {
    // const debug = shared.env.logger('melon:protocol:utils', LogLevels.DEBUG);
    // const fundName = `test-fund-${randomString()}`;

    const {
      // exchangeConfigs,
      melonContracts,
      // thirdPartyContracts,
    } = shared.env.deployment;

    const { version, engine } = melonContracts;

    // amgu Price
    // const tokens = thirdPartyContracts.tokens;

    // const [quoteToken, baseToken] = tokens;
    // const defaultTokens = [quoteToken, baseToken];
    const amguToken = await getAmguToken(shared.env, version);
    const amguPrice = createQuantity(amguToken, '1000000000');
    const newAmguPrice = createQuantity(amguToken, '5000000000');
    await setAmguPrice(shared.env, engine, amguPrice);
    await setAmguPrice(shared.env, engine, newAmguPrice);
    const myAmguPrice = await getAmguPrice(shared.env, engine);

    console.log(
      'Amgu Price: ',
      myAmguPrice.quantity.value,
      ' ',
      myAmguPrice.token.symbol,
    );

    // read Engine Contract events
    const contract = getContract(shared.env, Contracts.Engine, engine);
    let events = await contract.getPastEvents('allEvents', {
      fromBlock: 0,
      toBlock: 'latest',
    });
    console.log('Engine Events: ', events);
  });

  test('Read exchange rates', async () => {
    // exchange rates
    let rates = {
      ETHMLN: 0,
      MLNUSD: 0,
      ETHUSD: 0,
    };

    let axinst = axios.create({
      baseURL: 'https://rest.coinapi.io',
      headers: { 'X-CoinAPI-Key': '6F388926-927B-4582-AE90-B1C8CD3D5B60' },
    });

    const getRate = async (a, b) => {
      try {
        const response = await axinst.get('/v1/exchangerate/' + a + '/' + b);
        return response.data;
      } catch (error) {
        console.error(error);
      }
    };

    for (let [key] of Object.entries(rates)) {
      let a = key.substr(0, 3);
      let b = key.substr(3, 3);

      rates[key] = await getRate(a, b);
      // console.log(key + ': ', rates[key]);
    }
  });

  test('Reading fund list', async () => {
    const {
      // exchangeConfigs,
      melonContracts,
      thirdPartyContracts,
    } = shared.env.deployment;

    const { version, ranking } = melonContracts;

    const [weth] = thirdPartyContracts.tokens;

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

    // setup a number of additional funds (max 9)

    const n = 3;
    for (let i = 1; i <= n; i++) {
      const envi = await withDifferentAccount(shared.env, shared.accounts[i]);

      const balance = await getBalance(shared.env);
      console.log('Balance: ', balance);

      await sendEth(shared.env, {
        howMuch: createQuantity(weth, 5),
        to: envi.wallet.address,
      });

      const bi = await getBalance(envi);
      console.log('Balance: ', bi);

      const fundi = await setupInvestedTestFund(envi);
      console.log('Fund: ', fundi);

      const investmentAmount2 = createQuantity(weth, 1);

      await approve(shared.env, {
        howMuch: investmentAmount2,
        spender: fundi.participationAddress,
      });

      await requestInvestment(shared.env, fundi.participationAddress, {
        investmentAmount,
      });

      await executeRequest(shared.env, fundi.participationAddress);

      const hubi = await getHub(shared.env, fundi.accountingAddress);
      console.log('Hub: ', hubi);
    }

    // get fund list
    const fundList = await getFundDetails(shared.env, ranking, version);
    console.log('List: ', fundList);

    // loop through funds to get interesting quantities
    for (let f of fundList) {
      let shutDown = await isShutDown(shared.env, f.address);
      console.log('Is Shut Down: ', shutDown);

      let routes = await getRoutes(shared.env, f.address);
      // console.log('Route: ', routes);
      // console.log('Accounting address: ', routes.accountingAddress);

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

    const fundListContract = getContract(
      shared.env,
      Contracts.Version,
      version,
    );
    let fundListEvents = await fundListContract.getPastEvents('allEvents', {
      fromBlock: 0,
      toBlock: 'latest',
    });
    console.log('Fund List Events', fundListEvents);
  });
});
