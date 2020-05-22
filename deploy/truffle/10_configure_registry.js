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

  // TODO: select even fewer tokens if possible
  const deregisterAssetList = [
    // '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    // '0xec67005c4E498Ec7f55E092bd1d35cbC47C91892',
    // '0x960b236A07cf122663c4303350609A66A7B288C0',
    '0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
    '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    // '0xdd974D5C2e2928deA5F71b9825b8b646686BD200',
    '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942',
    '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
    '0x1985365e9f78359a9B6AD760e32412f4a445E862',
    // '0x408e41876cCCDC0F92210600ef50372656052a38',
    '0x607F4C5BB672230e8672085532f7e901544a7375',
    '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
    // '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    // '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    '0xE41d2489571d322189246DaFA5ebDe1F4699F498'
  ];

  for (const asset of deregisterAssetList) {
    console.log(asset)
    await registry.deregisterAsset(asset);
  }

  const tokens = await registry.getRegisteredAssets();
  console.log(tokens)



  // TODO: remove (see below)
  const prices = [
    '1000000000000000000',
    '15493827448525507',
    '7155317708731349',
    // '0',
    // '0',
    '3493602270127730',
    // '0',
    // '0',
    // '0',
    // '0',
    '413146688368029',
    // '0',
    // '0',
    '5255018519617450',
    '46814674803388154855',
    // '0'
  ];


  // // TODO: re-enable; don't use above hardcoding of course
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
