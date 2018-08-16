import getPricesFromAPI from "./sources/getPricesFromAPI";
import getDiscountedPrices from "./sources/getDiscountedPrices";
import web3 from "../../utils/lib/web3";
import  {bytesToHex, splitArray} from "./utils";
import {retrieveContract} from "../../utils/lib/contracts";

const BigNumber = require("bignumber.js");
const fs = require("fs");

async function updateReservePrices(configFilePath, account) {
  await web3.eth.accounts.wallet.add(account);
  const accounts = await web3.eth.getAccounts();
  await web3.eth.sendTransaction({to: account.address, from: accounts[0], value: new BigNumber(10 ** 25)});
  const json = JSON.parse(fs.readFileSync(configFilePath));
  const opts = {from: account.address, gas: json.gasLimit};
  const ratesContract = await retrieveContract("exchange/thirdparty/kyber/ConversionRates", json.conversionRatesAddress);
  const tokens = [];
  const baseBuy = [];
  const baseSell = [];
  const buys = [];
  const sells = [];
  const compactBuyArr = [];
  const compactSellArr = [];
  const indices = [];

  // Get listed tokens in the reserve
  const listedTokens = await ratesContract.methods.getListedTokens().call();

  // Create accounts
  let prices = await getPricesFromAPI(json.tokens);
  prices = getDiscountedPrices(prices, json.discountMultiplier);

  /* eslint-disable no-await-in-loop */
  let index = 0;
  for (const i of Object.keys(prices)) {

    // Throw error if indexing of tokens is messed up
    if (listedTokens[index] !== i) {
      throw new Error("Token order in config file doesn't match order in Conversion Rates contract");
    }

    const [, isEnabled] = Object.values(await ratesContract.methods.getTokenBasicData(i).call());
    /* eslint-disable no-continue */
    if (!isEnabled) continue;

    const currentBlock = await web3.eth.getBlockNumber();
    const basicBuyRate = await ratesContract.methods
      .getBasicRate(i, true)
      .call();
    const basicSellRate = await ratesContract.methods
      .getBasicRate(i, false)
      .call();
    const buyChangeBps =
      Math.floor(Number(prices[i].buyPrice.sub(basicBuyRate).mul(1000)) / basicBuyRate);
    const sellChangeBps =
      Math.floor(Number(prices[i].sellPrice.sub(basicSellRate).mul(1000)) / basicSellRate);

    if (
      buyChangeBps < -128 ||
      buyChangeBps > 127 ||
      sellChangeBps < -128 ||
      sellChangeBps > 127
    ) {
      tokens.push(i);
      baseBuy.push(prices[i].buyPrice);
      baseSell.push(prices[i].sellPrice);
      compactBuyArr.push(0);
      compactSellArr.push(0);
    } else {
      compactBuyArr.push(buyChangeBps);
      compactSellArr.push(sellChangeBps);
    }

    index += 1;
    console.log(`Current buy rate${  i  }: ${  await ratesContract.methods
      .getRate(i, currentBlock, true, 100)
      .call()}`);
    console.log(await ratesContract.methods
      .getRate(i, currentBlock, false, 100)
      .call());
    console.log(prices[i]);
    console.log(buyChangeBps.toString());
    console.log(sellChangeBps.toString());
  }

  const splitCompactBuyArr = splitArray(compactBuyArr, 14);
  const splitCompactSellArr = splitArray(compactSellArr, 14);
  for (let i = 0; i < splitCompactBuyArr.length; i += 1) {
    buys.push(bytesToHex(splitCompactBuyArr[i]));
    sells.push(bytesToHex(splitCompactSellArr[i]));
    indices.push(i);
  }
  const currentBlock = await web3.eth.getBlockNumber();

  await ratesContract.methods
    .setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices)
    .send(opts);

}

export default updateReservePrices;
