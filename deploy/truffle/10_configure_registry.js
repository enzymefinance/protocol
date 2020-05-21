const conf = require('../deploy-config.js');
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

// const AirSwapSwap = artifacts.require('AirSwapSwap');
const AirSwapAdapter = artifacts.require('AirSwapSwap');
const Engine = artifacts.require('Engine');
const EngineAdapter = artifacts.require('EngineAdapter');
const KyberAdapter = artifacts.require('KyberAdapter');
const KyberNetworkProxy = artifacts.require('KyberNetworkProxy');
const KyberPriceFeed = artifacts.require('KyberPriceFeed');
const MatchingMarket = artifacts.require('MatchingMarket');
const OasisDexAdapter = artifacts.require('OasisDexAdapter');
const Registry = artifacts.require('Registry');
const SharesRequestor = artifacts.require('SharesRequestor');
const UniswapAdapter = artifacts.require('UniswapAdapter');
const UniswapFactory = artifacts.require('UniswapFactory');
const ZeroExV2Adapter = artifacts.require('ZeroExV2Adapter');
const ZeroExV2Exchange = artifacts.require('ZeroExV2Exchange');
const ZeroExV3Adapter = artifacts.require('ZeroExV3Adapter');
const ZeroExV3Exchange = artifacts.require('ZeroExV3Exchange');

// TODO: move to own module
/////////
// const updateFeed = async (feed, web3) => {
//   const quoteAsset = await call(feed, 'QUOTE_ASSET', [], {}, web3);
//   const registryAddress = await call(feed, 'registry', [], {}, web3);
//   const registry = getDeployed('Registry', registryAddress, web3);
//   const tokens = await call(registry, 'getRegisteredAssets', [], {}, web3);
//   const prices = []; // TODO: convert to promise.all
//   for (const token of tokens) {
//     console.log(`For ${token}`)
//     let tokenPrice;
//     if (token.toLowerCase() === quoteAsset.toLowerCase())
//       tokenPrice = toWei('1', 'ether');
//     else
//       tokenPrice = (await call(feed, 'getKyberPrice', [token, quoteAsset], {}, web3)).kyberPrice_
//     console.log(tokenPrice);
//     prices.push(tokenPrice);
//   }
//   await send(feed, 'update', [tokens, prices], {}, web3);
// }
/////////
/////////
const updateFeedTruffle = async (feed, registry) => {
  const quoteAsset = await feed.QUOTE_ASSET();
  const tokens = await registry.getRegisteredAssets();
  console.log(tokens)
  const prices = [
    '1000000000000000000',
    '15493827448525507',
    '7155317708731349',
    '0',
    '0',
    '3493602270127730',
    '0',
    '0',
    '0',
    '0',
    '413146688368029',
    '0',
    '0',
    '5255018519617450',
    '46814674803388154855',
    '0'
  ];

  // TODO: re-enable; don't use hardcoding of course
  // const prices = []; // TODO: convert to promise.all
  // for (const token of tokens) {
  //   console.log(`For ${token}`)
  //   let tokenPrice;
  //   if (token.toLowerCase() === quoteAsset.toLowerCase())
  //     tokenPrice = toWei('1', 'ether');
  //   else
  //     tokenPrice = (await feed.getKyberPrice(token, quoteAsset)).kyberPrice_;
  //   console.log(tokenPrice);
  //   prices.push(tokenPrice.toString());
  // }
  console.log(prices);
  await feed.update(tokens, prices);
  console.log('Post-update');
}
/////////

module.exports = async deployer => {
  const registry = await Registry.deployed();
  const kyberNetworkProxy = await KyberNetworkProxy.at(mainnetAddrs.kyber.KyberNetworkProxy);
  const matchingMarket = await MatchingMarket.at(mainnetAddrs.oasis.OasisDexExchange);
  const uniswapFactory = await UniswapFactory.at(mainnetAddrs.uniswap.UniswapFactory);
  const zeroExV2Exchange = await ZeroExV2Exchange.at(mainnetAddrs.zeroExV2.ZeroExV2Exchange);
  const zeroExV3Exchange = await ZeroExV3Exchange.at(mainnetAddrs.zeroExV3.ZeroExV3Exchange);
  const priceSource = await KyberPriceFeed.deployed();

  await registry.setPriceSource(priceSource.address);
  await registry.setEngine((await Engine.deployed()).address);
  await registry.setSharesRequestor((await SharesRequestor.deployed()).address);

  const integrations = {};
  integrations.engine = {
    gateway: (await Engine.deployed()).address,
    adapter: (await EngineAdapter.deployed()).address,
    integrationType: 0,
  };
  // integrations.airSwap = {
  //   gateway: input.airSwap.addr.Swap,
  //   adapter: airSwapAdapter.options.address,
  //   integrationType: 1
  // };
  integrations.kyber = {
    gateway: kyberNetworkProxy.address,
    adapter: (await KyberAdapter.deployed()).address,
    integrationType: 1
  };
  integrations.oasis = {
    gateway: matchingMarket.address,
    adapter: (await OasisDexAdapter.deployed()).address,
    integrationType: 1
  };
  integrations.uniswap = {
    gateway: uniswapFactory.address,
    adapter: (await UniswapAdapter.deployed()).address,
    integrationType: 1
  };
  integrations.zeroExV2 = {
    gateway: zeroExV2Exchange.address,
    adapter: (await ZeroExV2Adapter.deployed()).address,
    integrationType: 1
  };
  integrations.zeroExV3 = {
    gateway: zeroExV3Exchange.address,
    adapter: (await ZeroExV3Adapter.deployed()).address,
    integrationType: 1
  };

  // TODO: parallelize
  for (const info of Object.values(integrations)) {
    if (!(await registry.integrationAdapterIsRegistered(info.adapter))) {
      await registry.registerIntegrationAdapter(
        info.adapter,
        info.gateway,
        info.integrationType
      );
    }
  }

  // TODO: parallelize
  for (const tokenAddress of Object.values(mainnetAddrs.tokens)) {
    const alreadyRegistered = await registry.assetIsRegistered(tokenAddress);
    if (!alreadyRegistered) {
      await registry.registerAsset(tokenAddress);
    }
  }

  await updateFeedTruffle(priceSource, registry);
}
