import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { getLogCurried } from '~/utils/environment/getLogCurried';
import { getFundDetails } from '~/contracts/factory/calls/getFundDetails';
import { isShutDown } from '~/contracts/fund/hub/calls/isShutDown';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { getFundHoldings } from '~/contracts/fund/accounting/calls/getFundHoldings';
import { performCalculations } from '~/contracts/fund/accounting/calls/performCalculations';
import { getAmguPrice } from '~/contracts/engine/calls/getAmguPrice';
import { getPriceSource } from '~/contracts/engine/calls/getPriceSource';
import axios from 'axios';

import * as coinapi from './.coinapi.json';

expect.extend({ toBeTrueWith });

const getLog = getLogCurried('melon:protocol:systemTest:monitoring');

describe('playground', () => {
  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);
    const log = getLog(master);
    const { melonContracts } = master.deployment;

    const { version, engine } = melonContracts;

    let axinst = axios.create(coinapi);

    const getRate = async (a, b) => {
      log.debug('CoinAPI rate for: ' + a + '/' + b);
      try {
        const response = await axinst.get('/v1/exchangerate/' + a + '/' + b);
        return response.data;
      } catch (error) {
        console.error(error);
      }
    };

    const rates = {
      MLNETH: await getRate('MLN', 'ETH'),
      MLNUSD: await getRate('MLN', 'USD'),
      ETHUSD: await getRate('ETH', 'USD'),
    };

    // high level data
    const amguPrice = await getAmguPrice(master, engine);
    log.debug('Amgu Price: ', amguPrice);

    const priceSource = await getPriceSource(master, engine);
    log.debug('Price Source: ', priceSource);

    log.debug('Version: ', version);
    log.debug('Engine: ', engine);

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

    let totalAUMETH = 0;
    let totalAUMUSD = 0;

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

      const targetCurrency = 'ETH';
      let quoteCurrency = fundList[i].sharePrice.quote.token.symbol;

      if (quoteCurrency == 'WETH') {
        quoteCurrency = 'ETH';
      }

      if (targetCurrency != quoteCurrency) {
        if (!rates.hasOwnProperty(quoteCurrency + targetCurrency)) {
          fundList[i].toETH = await getRate(quoteCurrency, targetCurrency);
          rates[quoteCurrency + targetCurrency] = fundList[i].toETH;
        } else {
          fundList[i].toETH = rates[quoteCurrency + targetCurrency];
        }
      } else {
        fundList[i].toETH = {
          rate: 1,
        };
      }

      if (!rates.hasOwnProperty(quoteCurrency + 'USD')) {
        fundList[i].toUSD = await getRate(quoteCurrency, 'USD');
        rates[quoteCurrency + 'USD'] = fundList[i].toUSD;
      } else {
        fundList[i].toUSD = rates[quoteCurrency + 'USD'];
      }

      fundList[i].fundNAVETH =
        (fundList[i].calcs.nav.quantity * fundList[i].toETH.rate) /
        10 ** fundList[i].calcs.nav.token.decimals;
      fundList[i].fundNAVUSD =
        (fundList[i].calcs.nav.quantity * fundList[i].toUSD.rate) /
        10 ** fundList[i].calcs.nav.token.decimals;

      totalAUMETH += fundList[i].fundNAVETH;
      totalAUMUSD += fundList[i].fundNAVUSD;

      fundList[i].numberOfShares =
        fundList[i].calcs.nav.quantity /
        fundList[i].calcs.sharePrice.quote.quantity;
    }
    log.debug('Modified fund list', fundList);

    // Number of funds (active, inactive, total)
    numberOfFunds.active = fundList.filter(f => {
      return f.isShutDown === false;
    }).length;
    log.debug('Active funds: ', numberOfFunds.active);

    numberOfFunds.inActive = fundList.filter(f => {
      return f.isShutDown === true;
    }).length;
    log.debug('Inactive funds: ', numberOfFunds.inActive);

    // AuM in ETH and USD
    log.debug('AuM in ETH:', totalAUMETH);
    log.debug('AuM in USD:', totalAUMUSD);

    log.debug(
      'Amgu price (MLN): ',
      amguPrice.quantity / 10 ** amguPrice.token.decimals,
    );
    log.debug(
      'Amgu price (ETH): ',
      (amguPrice.quantity / 10 ** amguPrice.token.decimals) * rates.MLNETH.rate,
    );
    log.debug(
      'Amgu price (USD): ',
      (amguPrice.quantity / 10 ** amguPrice.token.decimals) * rates.MLNUSD.rate,
    );

    // Fund Ranking AuM (ETH)
    const top10Funds = fundList.sort((a, b) => {
      return a.fundNAVETH < b.fundNAVETH
        ? 1
        : a.fundNAVETH > b.fundNAVETH
        ? -1
        : 0;
    });

    log.debug('Top 10 Funds: ', top10Funds);

    // random stuff so that everything before runs and logs correctly
    let fundList2 = await getFundDetails(
      master,
      melonContracts.ranking,
      melonContracts.version,
    );

    log.debug('list 2 : ', fundList2);
  });
});
