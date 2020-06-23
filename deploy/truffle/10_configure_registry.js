const conf = require('../deploy-config.js');
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

const AirSwapAdapter = artifacts.require('AirSwapAdapter');
const AssetBlacklist = artifacts.require('AssetBlacklist');
const AssetWhitelist = artifacts.require('AssetWhitelist');
const Engine = artifacts.require('Engine');
const EngineAdapter = artifacts.require('EngineAdapter');
const IConversionRates = artifacts.require('IConversionRates');
const KyberAdapter = artifacts.require('KyberAdapter');
const KyberPriceFeed = artifacts.require('KyberPriceFeed');
const ManagementFee = artifacts.require('ManagementFee');
const MaxConcentration = artifacts.require('MaxConcentration');
const MaxPositions = artifacts.require('MaxPositions');
const OasisDexAdapter = artifacts.require('OasisDexAdapter');
const PerformanceFee = artifacts.require('PerformanceFee');
const PriceTolerance = artifacts.require('PriceTolerance');
const Registry = artifacts.require('Registry');
const SharesRequestor = artifacts.require('SharesRequestor');
const UniswapAdapter = artifacts.require('UniswapAdapter');
const UserWhitelist = artifacts.require('UserWhitelist');
const ValueInterpreter = artifacts.require('ValueInterpreter');
const ZeroExV2Adapter = artifacts.require('ZeroExV2Adapter');
const ZeroExV3Adapter = artifacts.require('ZeroExV3Adapter');

const updateKyberFeedTruffle = async (feed, registry) => {
  const quoteAsset = await feed.PRICEFEED_QUOTE_ASSET();

  // TODO: move account loading somewhere else most likely; maybe a pre-deploy script
  /////////////////////////////////
  const zrxReserveAdmin = '0xa57bd00134b2850b2a1c55860c9e9ea100fdd6cf';
  const zrxConversionRatesAddress = '0xfb80bfa19cae9e00f28b0f7e1023109deeb10483'
  // const mlnReserveAdmin = '0x2Fd6181541bEbe30D17CF3a5d9f40eBceCbdBA43';
  // const mlnConversionRatesAddress = '0x56e69afad3a92394cedc02cfee821f1c05e86c47';

  const zrxConversionRates = await IConversionRates.at(zrxConversionRatesAddress);
  // const mlnConversionRates = await ConversionRates.at(mlnConversionRatesAddress);

  // Load account with eth TODO: move this somewhere else?
  const [primary] = await web3.eth.getAccounts();
  await web3.eth.sendTransaction({
    from: primary,
    to: zrxReserveAdmin,
    value: web3.utils.toWei('100', 'ether')
  });
  // await web3.eth.sendTransaction({
  //   from: primary,
  //   to: mlnReserveAdmin,
  //   value: web3.utils.toWei('100', 'ether')
  // });

  await zrxConversionRates.setValidRateDurationInBlocks(
    '10000000000000000000000',
    {from: zrxReserveAdmin}
  );
  // console.log('before conv set')
  // await mlnConversionRates.setValidRateDurationInBlocks(
  //   '10000000000000000000000',
  //   {from: mlnReserveAdmin}
  // );
  // console.log('after conv set')

  /////////////////////////////////

  // TODO: select even fewer tokens if possible
  // TODO: avoid hardcoding these addresses
  const deregisterPrimitiveList = [
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
    deregisterPrimitiveList.map(
      primitive => registry.deregisterPrimitive(primitive)
    )
  );

  const tokens = await registry.getRegisteredPrimitives();

  const prices = {}; // TODO: convert to promise.all

  console.log('before get prices')
  await Promise.all(tokens.map(
    async token => {
      console.log(`getting price for ${token}`)
      let tokenPrice;
      if (token.toLowerCase() === quoteAsset.toLowerCase())
        tokenPrice = web3.utils.toWei('1', 'ether');
      else
        tokenPrice = (await feed.getLiveRate(token, quoteAsset)).rate_;
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

  await registry.setPriceSource(priceSource.address);
  await registry.setEngine((await Engine.deployed()).address);
  await registry.setSharesRequestor((await SharesRequestor.deployed()).address);
  await registry.setValueInterpreter((await ValueInterpreter.deployed()).address);

  const integrationAdapters = [
    (await EngineAdapter.deployed()).address,
    (await AirSwapAdapter.deployed()).address,
    (await KyberAdapter.deployed()).address,
    (await OasisDexAdapter.deployed()).address,
    (await UniswapAdapter.deployed()).address,
    (await ZeroExV2Adapter.deployed()).address,
    (await ZeroExV3Adapter.deployed()).address
  ];

  const policies = [
    (await AssetBlacklist.deployed()).address,
    (await AssetWhitelist.deployed()).address,
    (await MaxConcentration.deployed()).address,
    (await MaxPositions.deployed()).address,
    (await PriceTolerance.deployed()).address,
    (await UserWhitelist.deployed()).address
  ];

  const fees = [
    (await ManagementFee.deployed()).address,
    (await PerformanceFee.deployed()).address
  ];

  // TODO: parallelize
  for (const policy of policies) {
    if (!(await registry.policyIsRegistered(policy))) {
      await registry.registerPolicy(policy);
    }
  }

  // TODO: parallelize
  for (const integrationAdapter of integrationAdapters) {
    if (!(await registry.integrationAdapterIsRegistered(integrationAdapter))) {
      await registry.registerIntegrationAdapter(integrationAdapter);
    }
  }

  // TODO: parallelize
  for (const tokenAddress of Object.values(mainnetAddrs.tokens)) {
    if (!await registry.primitiveIsRegistered(tokenAddress)) {
      await registry.registerPrimitive(tokenAddress);
    }
  }

  for (const fee of fees) {
    if (!(await registry.feeIsRegistered(fee))) {
      await registry.registerFee(fee);
    }
  }

  await updateKyberFeedTruffle(priceSource, registry);
}
