import * as instances from "./instances";

const rp = require("request-promise");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

const apiPath = "https://min-api.cryptocompare.com/data/price";

const tokenInfo = require("../../utils/info/tokenInfo.js").kovan;

// convenience functions
function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function registerAsset () {
  const fromSymbol = 'MLN';
  const toSymbols = ['ETH', 'EUR', 'MLN'];
  const options = {
    uri: `${apiPath}?fsym=${fromSymbol}&tsyms=${toSymbols.join(',')}&sign=true`,
    json: true
  }
  const queryResult = await rp(options);
  const ethDecimals = tokenInfo.filter(token => token.symbol === 'ETH-T')[0].decimals
  const eurDecimals = tokenInfo.filter(token => token.symbol === 'EUR-T')[0].decimals
  const mlnDecimals = tokenInfo.filter(token => token.symbol === 'MLN-T')[0].decimals
  const inverseEth = new BigNumber(1).div(new BigNumber(queryResult.ETH)).toNumber().toFixed(15);
  const inverseEur = new BigNumber(1).div(new BigNumber(queryResult.EUR)).toNumber().toFixed(15);
  const inverseMln = new BigNumber(1).div(new BigNumber(queryResult.MLN)).toNumber().toFixed(15);
  const convertedEth = new BigNumber(inverseEth).div(10 ** (ethDecimals - mlnDecimals)).times(10 ** ethDecimals);
  const convertedEur = new BigNumber(inverseEur).div(10 ** (eurDecimals - mlnDecimals)).times(10 ** eurDecimals);
  const convertedMln = new BigNumber(inverseMln).div(10 ** (mlnDecimals - mlnDecimals)).times(10 ** mlnDecimals);
  await timeout(3000);
  await instances.datafeed.instance.update.postTransaction(
    { from: (await instances.accounts)[0], gas: config.gas, gasPrice: config.gasPrice },
    [[instances.ethToken.address, instances.eurToken.address, instances.mlnToken.address],
    [convertedEth, convertedEur, convertedMln]]
  );
}
