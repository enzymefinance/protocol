const {call, send, nab} = require('../utils/deploy-contract');
const web3 = require('../utils/get-web3');
const BN = web3.utils.BN;

// TODO: check whether each "send" needs to be done before sending it
const main = async input => {
  const conf = input.conf;
  const melonConf = input.melon.conf;
  const melonAddrs = input.melon.addr;
  const tokenAddrs = input.tokens.addr;

  const kyberAdapter = await nab('KyberAdapter', [], melonAddrs);
  const oasisDexAdapter = await nab('OasisDexAdapter', [], melonAddrs);
  const uniswapAdapter = await nab('UniswapAdapter', [], melonAddrs);
  const zeroExV2Adapter = await nab('ZeroExV2Adapter', [], melonAddrs);
  const zeroExV3Adapter = await nab('ZeroExV3Adapter', [], melonAddrs);
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
  const registry = await nab('Registry', [melonConf.registryOwner], melonAddrs);
  const engine = await nab('Engine', [melonConf.engineDelay, registry.options.address], melonAddrs);

  let priceSource;
  if (conf.track === 'KYBER_PRICE') {
    priceSource = await nab('KyberPriceFeed', [
      registry.options.address, input.kyber.addr.KyberNetworkProxy,
      melonConf.maxSpread, tokenAddrs.WETH
    ], melonAddrs);
  } else if (conf.track === 'TESTING') {
    priceSource = await nab('TestingPriceFeed', [tokenAddrs.WETH, input.tokens.conf.WETH.decimals], melonAddrs);
  }

  const previousRegisteredPriceSource = await call(registry, 'priceSource');
  if (`${previousRegisteredPriceSource}`.toLowerCase() !== priceSource.options.address.toLowerCase()) {
    await send(registry, 'setPriceSource', [priceSource.options.address]);
  }
  const previousRegisteredNativeAsset = await call(registry, 'nativeAsset');
  if (`${previousRegisteredNativeAsset}`.toLowerCase() !== tokenAddrs.WETH.toLowerCase()) {
    await send(registry, 'setNativeAsset', [tokenAddrs.WETH]);
  }
  const previousRegisteredMlnToken = await call(registry, 'mlnToken');
  if (`${previousRegisteredMlnToken}`.toLowerCase() !== tokenAddrs.MLN.toLowerCase()) {
    await send(registry, 'setMlnToken', [tokenAddrs.MLN]);
  }
  const previousRegisteredEngine = await call(registry, 'engine');
  if (`${previousRegisteredEngine}`.toLowerCase() !== engine.options.address.toLowerCase()) {
    await send(registry, 'setEngine', [engine.options.address]);
  }
  const previousRegisteredMGM = await call(registry, 'MGM');
  if (`${previousRegisteredMGM}`.toLowerCase() !== melonConf.initialMGM.toLowerCase()) {
    await send(registry, 'setMGM', [melonConf.initialMGM]);
  }
  await send(registry, 'registerFees', [[ managementFee.options.address, performanceFee.options.address]]);

  const sigs = [
    'takeOrder(address,address[8],uint256[8],bytes[4],bytes32,bytes)',
  ].map(s => web3.utils.keccak256(s).slice(0,10));

  const exchanges = {};
  exchanges.engine = {
    exchange: engine.options.address,
    adapter: engineAdapter.options.address,
    takesCustody: melonConf.exchangeTakesCustody.engine
  };
  if (input.kyber) {
    exchanges.kyber = {
      exchange: input.kyber.addr.KyberNetworkProxy,
      adapter: kyberAdapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.kyber
    };
  }
  if (input.oasis) {
    exchanges.oasis = {
      exchange: input.oasis.addr.OasisDexExchange,
      adapter: oasisDexAdapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.oasis
    };
  }
  if (input.uniswap) {
    exchanges.uniswap = {
      exchange: input.uniswap.addr.UniswapFactory,
      adapter: uniswapAdapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.uniswap
    };
  }
  if (input.zeroExV2) {
    exchanges.zeroExV2 = {
      exchange: input.zeroExV2.addr.ZeroExV2Exchange,
      adapter: zeroExV2Adapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.zeroExV2
    };
  }
  if (input.zeroExV3) {
    exchanges.zeroExV3 = {
      exchange: input.zeroExV3.addr.ZeroExV3Exchange,
      adapter: zeroExV3Adapter.options.address,
      takesCustody: melonConf.exchangeTakesCustody.zeroExV3
    };
  }

  for (const info of Object.values(exchanges)) {
    const isRegistered = await call(registry, 'exchangeAdapterIsRegistered', [info.adapter]);
    // TODO: check here if we actually need to update as well
    if (isRegistered) {
      await send(registry, 'updateExchangeAdapter', [info.exchange, info.adapter, info.takesCustody, sigs]);
    } else {
      await send(registry, 'registerExchangeAdapter', [info.exchange, info.adapter, info.takesCustody, sigs]);
    }
  }

  for (const [sym, info] of Object.entries(input.tokens.conf)) {
    const tokenAddress = tokenAddrs[sym];
    const assetInfo = await call(registry, 'assetInformation', [tokenAddress]);
    if (!assetInfo.exists) {
      // TODO: fix token.sym and reserveMin
      const reserveMin = 0;
      await send(registry, 'registerAsset', [tokenAddress, info.name, sym, '', reserveMin, [], []]);
    }
    if (conf.track === 'TESTING') {
      const previousDecimals = await call(priceSource, 'assetsToDecimals', [tokenAddress]);
      if (previousDecimals.toString() !== info.decimals.toString()) {
        await send(priceSource, 'setDecimals', [tokenAddress, info.decimals]);
      }
    }
  }

  const version = await nab('Version', [
    accountingFactory.options.address,
    feeManagerFactory.options.address,
    participationFactory.options.address,
    sharesFactory.options.address,
    tradingFactory.options.address,
    policyManagerFactory.options.address,
    registry.options.address,
    melonConf.versionOwner
  ], melonAddrs);

  const versionInformation = await call(registry, 'versionInformation', [version.options.address]);

  if (!versionInformation.exists) {
    let versionName;
    if (conf.track === 'TESTING') {
      versionName = web3.utils.padLeft(web3.utils.toHex(`${Date.now()}`), 64);
    } else {
      versionName = web3.utils.padLeft(web3.utils.toHex(melonConf.versionName), 64);
    }
    await send(registry, 'registerVersion', [ version.options.address, versionName ]);
  }

  if (conf.track === 'KYBER_PRICE')
    await send(priceSource, 'update');
  else if (conf.track === 'TESTING') {
    // TODO: get actual prices
    const fakePrices = Object.values(tokenAddrs).map(() => (new BN('10')).pow(new BN('18')).toString());
    await send(priceSource, 'update', [Object.values(tokenAddrs), fakePrices]);
  }

  const contracts = {
    "KyberAdapter": kyberAdapter,
    "OasisDexAdapter": oasisDexAdapter,
    "UniswapAdapter": uniswapAdapter,
    "ZeroExV2Adapter": zeroExV2Adapter,
    "ZeroExV3Adapter": zeroExV3Adapter,
    "EngineAdapter": engineAdapter,
    "PriceTolerance": priceTolerance,
    "UserWhitelist": userWhitelist,
    "ManagementFee": performanceFee,
    "AccountingFactory": accountingFactory,
    "FeeManagerFactory": feeManagerFactory,
    "ParticipationFactory": participationFactory,
    "PolicyManagerFactory": policyManagerFactory,
    "SharesFactory": sharesFactory,
    "TradingFactory": tradingFactory,
    "PerformanceFee": performanceFee,
    "ManagementFee": managementFee,
    "Registry": registry,
    "Engine": engine,
    "Version": version,
  };

  if (conf.track === 'KYBER_PRICE') {
    contracts.KyberPriceFeed = priceSource;
  } else if (conf.track === 'TESTING') {
    contracts.TestingPriceFeed = priceSource;
  }

  return contracts;
}

module.exports = main;
