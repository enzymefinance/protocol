import getPricesFromAPI from "./sources/getPricesFromAPI";
import getDiscountedPrices from "./sources/getDiscountedPrices";
import web3 from "../../utils/lib/web3";
import  {bytesToHex, splitArray} from "./utils";

const fs = require("fs");

const devchainConfigFile = "./utils/kyber/devchain-reserve.json";
const json = JSON.parse(fs.readFileSync(devchainConfigFile));

async function updateReservePrices(ratesContract) {
  const tokens = [];
  const baseBuy = [];
  const baseSell = [];
  const buys = [];
  const sells = [];
  const compactBuyArr = [];
  const compactSellArr = [];
  const indices = [];

  let prices = await getPricesFromAPI(json.tokens);
  prices = getDiscountedPrices(prices, json.discountMultiplier);

  /* eslint-disable no-await-in-loop */
  for (const i of Object.keys(prices)) {
    const currentBlock = await web3.eth.getBlockNumber();

    const currentBuyRate = await ratesContract.methods
      .getRate(i, currentBlock, true, 100)
      .call();
    const basicBuyRate = await ratesContract.methods
      .getBasicRate(i, true)
      .call();
    const currentSellRate = await ratesContract.methods
      .getRate(i, currentBlock, false, 100)
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
    .send();
}

export default updateReservePrices;
