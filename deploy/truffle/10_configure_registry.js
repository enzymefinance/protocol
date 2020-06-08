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

const ConversionRates = artifacts.require('ConversionRates');

const updateKyberFeedTruffle = async (feed, registry) => {
  const quoteAsset = await feed.QUOTE_ASSET();

  // TODO: move account loading somewhere else most likely; maybe a pre-deploy script
  /////////////////////////////////
  const zrxReserveAdmin = '0xa57bd00134b2850b2a1c55860c9e9ea100fdd6cf';

  // Load account with eth TODO: move this somewhere else?
  const [primary] = await web3.eth.getAccounts();
  await web3.eth.sendTransaction({
    from: primary,
    to: zrxReserveAdmin,
    value: web3.utils.toWei('100', 'ether')
  });

  const zrxConversionRates = await ConversionRates.at('0xfb80bfa19cae9e00f28b0f7e1023109deeb10483');
  await zrxConversionRates.setValidRateDurationInBlocks(
    '10000000000000000000000',
    {from: zrxReserveAdmin}
  );
  
  /////////////////////////////////

  // TODO: select even fewer tokens if possible
  // TODO: avoid hardcoding these addresses
  const deregisterAssetList = [
    // '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    // '0xec67005c4E498Ec7f55E092bd1d35cbC47C91892', // MLN
    '0x960b236A07cf122663c4303350609A66A7B288C0',
    '0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
    '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    // '0xdd974D5C2e2928deA5F71b9825b8b646686BD200', // KNC
    '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942',
    '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
    '0x1985365e9f78359a9B6AD760e32412f4a445E862',
    '0x408e41876cCCDC0F92210600ef50372656052a38',
    '0x607F4C5BB672230e8672085532f7e901544a7375',
    '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    // '0xE41d2489571d322189246DaFA5ebDe1F4699F498', // ZRX
  ];

  await Promise.all(
    deregisterAssetList.map(
      asset => registry.deregisterAsset(asset)
    )
  );

  const tokens = await registry.getRegisteredAssets();

  const prices = {}; // TODO: convert to promise.all

  console.log('before get prices')
  await Promise.all(tokens.map(
    async token => {
      console.log(`getting price for ${token}`)
      let tokenPrice;
      if (token.toLowerCase() === quoteAsset.toLowerCase())
        tokenPrice = web3.utils.toWei('1', 'ether');
      else
        tokenPrice = (await feed.getKyberPrice(token, quoteAsset)).kyberPrice_;
      console.log(`got price for ${token}`)
      prices[token] = tokenPrice.toString();
    }
  ));
  console.log('after get prices')

  const orderedPrices = tokens.map(token => prices[token]);
  console.log('before update')
  await feed.update(tokens, orderedPrices);
  console.log('after update')
}
/////////

module.exports = async _ => {
  const registry = await Registry.deployed();
  const priceSource = await KyberPriceFeed.deployed();
  const kyberNetworkProxy = await KyberNetworkProxy.at(mainnetAddrs.kyber.KyberNetworkProxy);
  const matchingMarket = await MatchingMarket.at(mainnetAddrs.oasis.OasisDexExchange);
  const uniswapFactory = await UniswapFactory.at(mainnetAddrs.uniswap.UniswapFactory);
  const zeroExV2Exchange = await ZeroExV2Exchange.at(mainnetAddrs.zeroExV2.ZeroExV2Exchange);
  const zeroExV3Exchange = await ZeroExV3Exchange.at(mainnetAddrs.zeroExV3.ZeroExV3Exchange);

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

  await updateKyberFeedTruffle(priceSource, registry);
}
