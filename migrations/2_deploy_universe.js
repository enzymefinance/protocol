const Universe = artifacts.require('./Universe.sol');

const tokenInfo = require('./config/token_info.js');
const dataFeedInfo = require('./config/data_feed_info.js');
const exchangeInfo = require('./config/exchange_info.js');


module.exports = async function (deployer, network) {
  // if (network === "development") return;
  try {
    await deployer.deploy(Universe,
        tokenInfo.kovan.map(info => info.address),
        Array(tokenInfo.kovan.length).fill(dataFeedInfo.kovan.find(info => info.name === 'CryptoCompare').address),
        Array(tokenInfo.kovan.length).fill(exchangeInfo.kovan.find(info => info.name === 'OasisDex').address),
      )
  } catch (e) {
    throw e;
  }
};
