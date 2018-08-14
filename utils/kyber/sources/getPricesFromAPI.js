const BigNumber = require("bignumber.js");
const rp = require("request-promise");

const apiPath = "https://min-api.cryptocompare.com/data/price";
const fromSymbol = "ETH";
const quoteDecimals = 18;

BigNumber.config({ ERRORS: false });

// TODO: DRY
// retry the request if it fails (helps with bad connections)
async function requestWithRetries(options, maxRetries) {
  if (maxRetries === -1) {
    throw new Error("Request failed. Max retry limit reached.");
  } else {
    try {
      return await rp(options);
    } catch (err) {
      console.error(`Error during request:\n${err.message}`);
      return requestWithRetries(options, maxRetries - 1);
    }
  }
}

async function getPricesFromAPI(tokenArray) {
  const toSymbols = [];

  toSymbols.push(fromSymbol);
  for (const i of Object.keys(tokenArray)) {
    toSymbols.push(tokenArray[i].symbol);
  }

  const options = {
    uri: `${apiPath}?fsym=${fromSymbol}&tsyms=${toSymbols.join(",")}&sign=true`,
    json: true,
  };
  const queryResult = await requestWithRetries(options, 3);
  if (queryResult[fromSymbol] !== 1) {
    throw new Error(`API call returned incorrect price for ${fromSymbol}`);
  } else if (Object.values(queryResult).indexOf(0) !== -1) {
    throw new Error("API call returned a zero price");
  }

  const prices = {};
  for (const i of Object.keys(tokenArray)) {
    const inversePrice = new BigNumber(1)
      .div(new BigNumber(queryResult[tokenArray[i].symbol]))
      .toNumber()
      .toFixed(15);
    const sellPrice = new BigNumber(inversePrice)
      .div(10 ** (tokenArray[i].decimals - quoteDecimals))
      .times(10 ** tokenArray[i].decimals);
    const buyPrice = new BigNumber(
      new BigNumber(10 ** quoteDecimals)
        .mul(10 ** tokenArray[i].decimals)
        .div(sellPrice)
        .toFixed(0),
    );
    const priceObject = { buyPrice, sellPrice };
    prices[tokenArray[i].address] = priceObject;
  }
  return prices;
}

export default getPricesFromAPI;
