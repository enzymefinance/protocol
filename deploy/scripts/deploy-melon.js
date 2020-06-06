const {call, send, nab} = require('../utils/deploy-contract');
const web3 = require('../utils/get-web3');
const BN = web3.utils.BN;

// TODO: check whether each "send" needs to be done before sending it
const main = async input => {
  const conf = input.conf;
  const melonConf = input.melon.conf;
  const melonAddrs = input.melon.addr;
  const tokenAddrs = input.tokens.addr;

  const priceTolerance = await nab('PriceTolerance', [melonConf.priceTolerance], melonAddrs);
  const userWhitelist = await nab('UserWhitelist', [melonConf.userWhitelist], melonAddrs);
  const managementFee = await nab('ManagementFee', [], melonAddrs);
  const performanceFee = await nab('PerformanceFee', [], melonAddrs);
  const feeManagerFactory = await nab('FeeManagerFactory', [], melonAddrs);
  const policyManagerFactory = await nab('PolicyManagerFactory', [], melonAddrs);
  const sharesFactory = await nab('SharesFactory', [], melonAddrs);
  const vaultFactory = await nab('VaultFactory', [], melonAddrs);
  const registry = await nab('Registry', [melonConf.registryOwner], melonAddrs);
  const engine = await nab('Engine', [melonConf.engineDelay, registry.options.address], melonAddrs);
  const sharesRequestor = await nab('SharesRequestor', [registry.options.address], melonAddrs);

  // Adapters
  const airSwapAdapter = await nab('AirSwapAdapter', [input.airSwap.addr.Swap], melonAddrs);
  const kyberAdapter = await nab('KyberAdapter', [input.kyber.addr.KyberNetworkProxy], melonAddrs);
  const oasisDexAdapter = await nab('OasisDexAdapter', [input.oasis.addr.OasisDexExchange], melonAddrs);
  const uniswapAdapter = await nab('UniswapAdapter', [input.uniswap.addr.UniswapFactory], melonAddrs);
  const zeroExV2Adapter = await nab('ZeroExV2Adapter', [input.zeroExV2.addr.ZeroExV2Exchange], melonAddrs);
  const zeroExV3Adapter = await nab('ZeroExV3Adapter', [input.zeroExV3.addr.ZeroExV3Exchange], melonAddrs);
  const engineAdapter = await nab('EngineAdapter', [engine.options.address], melonAddrs);

  const fundFactory = await nab('FundFactory', [
    feeManagerFactory.options.address,
    sharesFactory.options.address,
    vaultFactory.options.address,
    policyManagerFactory.options.address,
    registry.options.address
  ], melonAddrs);
  const previousRegisteredFundFactory = await call(registry, 'fundFactory');
  if (`${previousRegisteredFundFactory}`.toLowerCase() !== fundFactory.options.address.toLowerCase()) {
    await send(registry, 'setFundFactory', [fundFactory.options.address]);
  }

  let priceSource;
  if (conf.track === 'KYBER_PRICE') {
    priceSource = await nab('KyberPriceFeed', [
      registry.options.address, input.kyber.addr.KyberNetworkProxy,
      melonConf.maxSpread, tokenAddrs.WETH, melonConf.initialUpdater
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
  const previousRegisteredSharesRequestor = await call(registry, 'sharesRequestor');
  if (`${previousRegisteredSharesRequestor}`.toLowerCase() !== sharesRequestor.options.address.toLowerCase()) {
    await send(registry, 'setSharesRequestor', [sharesRequestor.options.address]);
  }

  const fees = [managementFee.options.address, performanceFee.options.address];
  for (const fee of fees) {
    if (!(await call(registry, 'feeIsRegistered', [fee]))) {
      await send(registry, 'registerFee', [fee]);
    }
  }

  const integrationAdapters = [
    engineAdapter.options.address,
    airSwapAdapter.options.address,
    kyberAdapter.options.address,
    oasisDexAdapter.options.address,
    uniswapAdapter.options.address,
    zeroExV2Adapter.options.address,
    zeroExV3Adapter.options.address
  ];
  for (const adapter of integrationAdapters) {
    if (!(await call(registry, 'integrationAdapterIsRegistered', [adapter]))) {
      await send(registry, 'registerIntegrationAdapter', [adapter]);
    }
  }

  for (const [sym, info] of Object.entries(input.tokens.conf)) {
    const tokenAddress = tokenAddrs[sym];
    if (!(await call(registry, 'assetIsRegistered', [tokenAddress]))) {
      await send(registry, 'registerAsset', [tokenAddress]);
    }
    if (conf.track === 'TESTING') {
      const previousDecimals = await call(priceSource, 'assetsToDecimals', [tokenAddress]);
      if (previousDecimals.toString() !== info.decimals.toString()) {
        await send(priceSource, 'setDecimals', [tokenAddress, info.decimals]);
      }
    }
  }

  if (conf.track === 'KYBER_PRICE')
    await send(priceSource, 'update');
  else if (conf.track === 'TESTING') {
    // TODO: get actual prices
    const fakePrices = Object.values(tokenAddrs).map(() => (new BN('10')).pow(new BN('18')).toString());
    await send(priceSource, 'update', [Object.values(tokenAddrs), fakePrices]);
  }

  const contracts = {
    "AirSwapAdapter": airSwapAdapter,
    "KyberAdapter": kyberAdapter,
    "OasisDexAdapter": oasisDexAdapter,
    "UniswapAdapter": uniswapAdapter,
    "ZeroExV2Adapter": zeroExV2Adapter,
    "ZeroExV3Adapter": zeroExV3Adapter,
    "EngineAdapter": engineAdapter,
    "PriceTolerance": priceTolerance,
    "UserWhitelist": userWhitelist,
    "FeeManagerFactory": feeManagerFactory,
    "PolicyManagerFactory": policyManagerFactory,
    "SharesFactory": sharesFactory,
    "VaultFactory": vaultFactory,
    "PerformanceFee": performanceFee,
    "ManagementFee": managementFee,
    "Registry": registry,
    "Engine": engine,
    "SharesRequestor": sharesRequestor,
    "FundFactory": fundFactory
  };

  if (conf.track === 'KYBER_PRICE') {
    contracts.KyberPriceFeed = priceSource;
  } else if (conf.track === 'TESTING') {
    contracts.TestingPriceFeed = priceSource;
  }

  return contracts;
}

module.exports = main;

