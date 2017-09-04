const Asset = artifacts.require('./Asset.sol');
const Market = artifacts.require('./SimpleMarket.sol');
const DataFeed = artifacts.require('./DataFeed.sol');
const Sphere = artifacts.require('./Sphere.sol');

const tokenInfo = require('./config/token_info.js');
const dataFeedInfo = require('./config/data_feed_info.js');
const exchangeInfo = require('./config/exchange_info.js');


module.exports = (deployer, network) => {
  if (network !== 'development') {
    const ethAddr = tokenInfo[network].find(t => t.symbol === 'ETH-T').address;
    const mlnAddr = tokenInfo[network].find(t => t.symbol === 'MLN-T').address;
    const tokenAddresses = tokenInfo[network].filter(
      t => // Note: Must be subset of what data feeds provide data for
        t.symbol !== 'AVT-T' &&
        t.symbol !== 'DGX-T' &&
        t.symbol !== 'MKR-T' &&
        t.symbol !== 'ZRX-T',
    ).map(t => t.address);
    deployer.deploy(DataFeed, mlnAddr, 120, 60)
    .then(() => deployer.deploy(Market))
    .then(() => deployer.deploy(Sphere, DataFeed.address, Market.address))
    .catch(e => { throw e; })
  } else {
    let ethAddr;
    let mlnAddr;
    let btcAddr;
    deployer.deploy(Asset, 'Ether Token', 'ETH-T', 18)
    .then(() => ethAddr = Asset.address)
    .then(() => deployer.deploy(Asset, 'Bitcoin Token', 'BTC-T', 18))
    .then(() => btcAddr = Asset.address)
    .then(() => deployer.deploy(Asset, 'Melon Token', 'MLN-T', 18))
    .then(() => mlnAddr = Asset.address)
    .then(() => deployer.deploy(DataFeed, mlnAddr, 120, 60))
    .then(() => deployer.deploy(Market))
    .catch(e => { throw e; })
  }
};
