const Universe = artifacts.require('./Universe.sol');

const tokenInfo = require('./config/token_info.js');
const dataFeedInfo = require('./config/data_feed_info.js');
const exchangeInfo = require('./config/exchange_info.js');


module.exports = async function (deployer, network) {
  if (network === 'development') return;
  const ethTokenAddress = tokenInfo[network].find(t => t.symbol === 'ETH-T').address;
  const mlnTokenAddress = tokenInfo[network].find(t => t.symbol === 'MLN-T').address;
  const tokenAddresses = tokenInfo[network].filter(
    t => // Note: Must be subset of what data feeds provide data for
      t.symbol !== 'AVT-T' &&
      t.symbol !== 'DGX-T' &&
      t.symbol !== 'MKR-T' &&
      t.symbol !== 'ZRX-T',
  ).map(t => t.address);
  try {
    await deployer.deploy(Universe,
      mlnTokenAddress,
      ethTokenAddress,
      tokenAddresses,
      Array(tokenInfo[network].length).fill(dataFeedInfo[network].find(d => d.name === 'CryptoCompare').address),
      Array(tokenInfo[network].length).fill(exchangeInfo[network].find(e => e.name === 'OasisDex').address),
    );
  } catch (e) {
    throw e;
  }
};
