const Asset = artifacts.require('./Asset.sol');
const Market = artifacts.require('./SimpleMarket.sol');
const DataFeed = artifacts.require('./DataFeed.sol');
const Sphere = artifacts.require('./Sphere.sol');
const dataFeedInfo = require('./config/data_feed_info.js');
const exchangeInfo = require('./config/exchange_info.js');


module.exports = (deployer, network) => {
  if (network !== 'development') {
    const mpDataFeedAddr = dataFeedInfo[network].find(t => t.name === 'Melonport').address;
    const simpleMarketAddr = exchangeInfo[network].find(t => t.name === 'OasisDex').address;
    // deployer.deploy(DataFeed, mlnAddr, 120, 60) // As a second option
    // .then(() =>
    deployer.deploy(Sphere, mpDataFeedAddr, simpleMarketAddr)
    .catch(e => { throw e; })
  } else {
    let mlnAddr;
    deployer.deploy(Asset, 'Ether Token', 'ETH-T', 18)
    .then(() => ethAddr = Asset.address)
    .then(() => deployer.deploy(Asset, 'Bitcoin Token', 'BTC-T', 18))
    .then(() => btcAddr = Asset.address)
    .then(() => deployer.deploy(Asset, 'Melon Token', 'MLN-T', 18))
    .then(() => mlnAddr = Asset.address)
    .then(() => deployer.deploy(DataFeed, mlnAddr, 120, 60))
    .then(() => deployer.deploy(Market))
    .then(() => deployer.deploy(Sphere, DataFeed.address, Market.address))
    .catch(e => { throw e; })
  }
};
