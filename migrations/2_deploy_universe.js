const Universe = artifacts.require('./Universe.sol');

const tokenInfo = require('./config/token_info.js');
const dataFeedInfo = require('./config/data_feed_info.js');
const exchangeInfo = require('./config/exchange_info.js');

const ethTokenAddress = tokenInfo.kovan.find(t => t.symbol === 'ETH-T').address;
const mlnTokenAddress = tokenInfo.kovan.find(t => t.symbol === 'MLN-T').address;
const tokenAddresses = tokenInfo.kovan.filter(
  t => // Note: Must be subset of what data feeds provide data for
    t.symbol !== 'AVT-T' &&
    t.symbol !== 'DGX-T' &&
    t.symbol !== 'MKR-T' &&
    t.symbol !== 'ZRX-T',
).map(t => t.address);

module.exports = async function (deployer, network) {
  if (network === 'development') return;
  try {
    await deployer.deploy(Universe,
      mlnTokenAddress,
      ethTokenAddress,
      tokenAddresses,
      Array(tokenInfo.kovan.length).fill(dataFeedInfo.kovan.find(d => d.name === 'CryptoCompare').address),
      Array(tokenInfo.kovan.length).fill(exchangeInfo.kovan.find(e => e.name === 'OasisDex').address),
    );
  } catch (e) {
    throw e;
  }
};
