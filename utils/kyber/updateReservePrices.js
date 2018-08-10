import getPricesFromAPI from "./sources/getPricesFromAPI";
import web3 from "../../utils/lib/web3";

const fs = require("fs");

const devchainConfigFile = "./utils/kyber/devchain-reserve.json";
const json = JSON.parse(fs.readFileSync(devchainConfigFile));

async function updateReservePrices(ratesContract) {

  const tokens = [];
  const baseBuy = [];
  const baseSell = [];
  const buys = [];
  const sells = [];
  const indices = [];
  const prices = await getPricesFromAPI(json.tokens);

  for (const i of Object.keys(prices)) {
    const currentBlock = await web3.eth.getBlockNumber();
    const currentBuyRate = await ratesContract.methods.getRate(i, currentBlock, true, 100).call();
    const currentSellRate = await ratesContract.methods.getRate(i, currentBlock, false, 100).call();
    const buyChangeBps = prices[i].buyPrice.mul(100).sub(currentBuyRate).div(currentBuyRate);
    const sellChangeBps =  prices[i].sellPrice.mul(100).sub(currentSellRate).div(currentSellRate);
    console.log(currentBuyRate);
    console.log(currentSellRate);
    console.log(prices[i]);
    console.log(buyChangeBps.toNumber());
    console.log(sellChangeBps.toNumber());
    tokens.push(i);
    baseBuy.push(prices[i].buyPrice);
    baseSell.push(prices[i].sellPrice);
  }

  const currentBlock = await web3.eth.getBlockNumber();
  await ratesContract.methods
    .setBaseRate(
      tokens,
      baseBuy,
      baseSell,
      buys,
      sells,
      currentBlock,
      indices,
    )
    .send();
}

export default updateReservePrices;
