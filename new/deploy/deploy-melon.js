const {call, send, nab} = require('./deploy-contract');
const web3 = require('./get-web3');
const BN = web3.utils.BN;

// TODO: check whether each "send" needs to be done before sending it
const main = async input => {
  const conf = input.conf;
  const melonConf = input.melon.conf;
  const melonAddrs = input.melon.addr;
  const tokenAddrs = input.tokens.addr;

  const ethfinexAdapter = await nab('EthfinexAdapter', [], melonAddrs);
  const kyberAdapter = await nab('KyberAdapter', [], melonAddrs);
  const matchingMarketAdapter = await nab('MatchingMarketAdapter', [], melonAddrs);
  const matchingMarketAccessor = await nab('MatchingMarketAccessor', [], melonAddrs);
  const zeroExV2Adapter = await nab('ZeroExV2Adapter', [], melonAddrs);
  const engineAdapter = await nab('EngineAdapter', [], melonAddrs);
  const priceTolerance = await nab('PriceTolerance', [melonConf.priceTolerance], melonAddrs);
  const userWhitelist = await nab('UserWhitelist', [melonConf.userWhitelist], melonAddrs);
  const managementFee = await nab('ManagementFee', [], melonAddrs);
  const performanceFee = await nab('PerformanceFee', [], melonAddrs);
  const accountingFactory = await nab('AccountingFactory', [], melonAddrs);
  const feeManagerFactory = await nab('FeeManagerFactory', [], melonAddrs);
  const participationFactory = await nab('ParticipationFactory', [], melonAddrs);
  const policyManagerFactory = await nab('PolicyManagerFactory', [], melonAddrs);
  const sharesFactory = await nab('SharesFactory', [], melonAddrs);
  const tradingFactory = await nab('TradingFactory', [], melonAddrs);
  const vaultFactory = await nab('VaultFactory', [], melonAddrs);
  const registry = await nab('Registry', [melonConf.registryOwner], melonAddrs);
  const engine = await nab('Engine', [melonConf.engineDelay, registry.options.address], melonAddrs);
  const fundRanking = await nab('FundRanking', [], melonAddrs);

  let priceSource;
  if (conf.track === 'KYBER_PRICE') {
    priceSource = await nab('KyberPriceFeed', [
      registry.options.address, input.kyber.addr.KyberNetworkProxy,
      melonConf.maxSpread, tokenAddrs.WETH
    ], melonAddrs);
  } else if (conf.track === 'TESTING') {
    priceSource = await nab('TestingPriceFeed', [tokenAddrs.WETH, input.tokens.conf.WETH.decimals], melonAddrs);
  }

  await send(registry, 'setPriceSource', [priceSource.options.address]);
  await send(registry, 'setNativeAsset', [tokenAddrs.WETH]);
  await send(registry, 'setMlnToken', [tokenAddrs.MLN]);
  await send(registry, 'setEngine', [engine.options.address]);
  await send(registry, 'setMGM', [melonConf.initialMGM]);
  await send(registry, 'setEthfinexWrapperRegistry', [input.ethfinex.addr.WrapperRegistryEFX]);
  await send(registry, 'registerFees', [[ managementFee.options.address, performanceFee.options.address]]);

  const sigs = [
    'makeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
    'takeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
    'cancelOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
    'withdrawTokens(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
  ].map(s => web3.utils.keccak256(s).slice(0,10));

  const exchanges = {
    engine: {
      exchange: engine.options.address,
      adapter: engineAdapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.engine
    },
    ethfinex: {
      exchange: input.ethfinex.addr.Exchange,
      adapter: ethfinexAdapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.ethfinex
    },
    kyber: {
      exchange: input.kyber.addr.KyberNetworkProxy,
      adapter: kyberAdapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.kyber
    },
    oasis: {
      exchange: input.oasis.addr.MatchingMarket,
      adapter: matchingMarketAdapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.oasis
    },
    zeroex: {
      exchange: input.zeroex.addr.Exchange,
      adapter: zeroExV2Adapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.zeroex
    }
  };

  for (const info of Object.values(exchanges)) {
    const isRegistered = await call(registry, 'exchangeAdapterIsRegistered', [info.adapter]);
    if (isRegistered) {
      await send(registry, 'updateExchangeAdapter', [info.exchange, info.adapter, info.takesCustody, sigs]);
    } else {
      await send(registry, 'registerExchangeAdapter', [info.exchange, info.adapter, info.takesCustody, sigs]);
    }
  }

  for (const [sym, info] of Object.entries(input.tokens.conf)) {
    const tokenAddress = tokenAddrs[sym];
    const isRegistered = await call(registry, 'assetIsRegistered', [tokenAddress]);
    if (!isRegistered) {
      // TODO: fix token.sym and reserveMin
      const reserveMin = 0;
      await send(registry, 'registerAsset', [tokenAddress, info.name, sym, '', reserveMin, [], []]);
    }
    if (conf.track === 'TESTING') {
      await send(priceSource, 'setDecimals', [tokenAddress, info.decimals]);
    }
  }

  const version = await nab('Version', [
    accountingFactory.options.address,
    feeManagerFactory.options.address,
    participationFactory.options.address,
    sharesFactory.options.address,
    tradingFactory.options.address,
    vaultFactory.options.address,
    policyManagerFactory.options.address,
    registry.options.address,
    melonConf.versionOwner
  ], melonAddrs);

  const versionInformation = await call(registry, 'versionInformation', [version.options.address]);

  if (!versionInformation.exists) {
    await send(registry, 'registerVersion',
      [
        version.options.address,
        web3.utils.padLeft(web3.utils.toHex(melonConf.versionName), 64)
      ]
    );
  }

  if (conf.track === 'KYBER_PRICE')
    await send(priceSource, 'update');
  else if (conf.track === 'TESTING') {
    // TODO: get actual prices
    const fakePrices = Object.values(tokenAddrs).map(() => (new BN('10')).pow(new BN('18')).toString());
    await send(priceSource, 'update', [Object.values(tokenAddrs), fakePrices]);
  }

  const addrs = {
    "EthfinexAdapter": ethfinexAdapter.options.address,
    "KyberAdapter": kyberAdapter.options.address,
    "MatchingMarketAdapter": matchingMarketAdapter.options.address,
    "MatchingMarketAccessor": matchingMarketAccessor.options.address,
    "ZeroExV2Adapter": zeroExV2Adapter.options.address,
    "EngineAdapter": engineAdapter.options.address,
    "PriceTolerance": priceTolerance.options.address,
    "UserWhitelist": userWhitelist.options.address,
    "ManagementFee": performanceFee.options.address,
    "AccountingFactory": accountingFactory.options.address,
    "FeeManagerFactory": feeManagerFactory.options.address,
    "ParticipationFactory": participationFactory.options.address,
    "PolicyManagerFactory": policyManagerFactory.options.address,
    "SharesFactory": sharesFactory.options.address,
    "TradingFactory": tradingFactory.options.address,
    "VaultFactory": vaultFactory.options.address,
    "Registry": registry.options.address,
    "Engine": engine.options.address,
    "FundRanking": fundRanking.options.address,
    "Version": version.options.address,
  };

  if (conf.track === 'KYBER_PRICE') {
    addrs.KyberPriceFeed = priceSource.options.address;
  } else if (conf.track === 'TESTING') {
    addrs.TestingPriceFeed = priceSource.options.address;
  }

  return addrs;
}

module.exports = main;
