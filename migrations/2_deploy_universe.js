const Universe = artifacts.require('./Universe.sol');

const tokenInfo = require('./config/token_info.js');
const dataFeedInfo = require('./config/data_feed_info.js');
const exchangeInfo = require('./config/exchange_info.js');

const ethTokenAddress = tokenInfo.kovan.find(t => t.symbol === 'ETH-T').address;
const mlnTokenAddress = tokenInfo.kovan.find(t => t.symbol === 'MLN-T').address;
const otherAddresses = tokenInfo.kovan.filter(t => t.symbol !== 'ETH-T' && t.symbol !== 'MLN-T').map(t => t.address);

module.exports = async function (deployer, network) {
  // if (network === "development") return;
  try {
    await deployer.deploy(Universe,
      [ethTokenAddress].concat([mlnTokenAddress]).concat(otherAddresses),
      Array(tokenInfo.kovan.length).fill(dataFeedInfo.kovan.find(info => info.name === 'CryptoCompare').address),
      Array(tokenInfo.kovan.length).fill(exchangeInfo.kovan.find(info => info.name === 'OasisDex').address),
    )
  } catch (e) {
    throw e;
  }
};
