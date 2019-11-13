const fs = require('fs');
const web3 = require('./get-web3');
const {call, deploy, send, nab} = require('./deploy-contract');
const deployIn = require('./get-deploy-input');

const deploy_in = './deploy_in.json'; // TODO: rename
const deploy_out = './melon_out.json'; // TODO: rename
const kyber_out = './kyber_out.json'; // TODO: rename

const main = async () => {
  // TODO: clean up conf stuff
  const deployIn = JSON.parse(fs.readFileSync(deploy_in));
  const conf = deployIn.conf;
  const melonConf = deployIn.melon.conf;
  const input = deployIn.melon.addr;
  const tokenConf = deployIn.tokens.conf;
  const tokenAddrs = deployIn.tokens.addr;
  const kyberAddrs = deployIn.kyber.addr;
  const exchanges = deployIn.exchangeConfigs;

  // TODO: move into conf.melon?
  const defaultMGM = conf.deployer;
  const defaultEthfinexWrapperRegistry = conf.deployer;

  const ethfinexAdapter = await nab('EthfinexAdapter', [], input);
  const kyberAdapter = await nab('KyberAdapter', [], input);
  const matchingMarketAdapter = await nab('MatchingMarketAdapter', [], input);
  const matchingMarketAccessor = await nab('MatchingMarketAccessor', [], input);
  const zeroExV2Adapter = await nab('ZeroExV2Adapter', [], input);
  const engineAdapter = await nab('EngineAdapter', [], input);
  const priceTolerance = await nab('PriceTolerance', [melonConf.priceTolerance], input);
  const userWhitelist = await nab('UserWhitelist', [melonConf.userWhitelist], input);
  const managementFee = await nab('ManagementFee', [], input);
  const performanceFee = await nab('PerformanceFee', [], input);
  const accountingFactory = await nab('AccountingFactory', [], input);
  const feeManagerFactory = await nab('FeeManagerFactory', [], input);
  const participationFactory = await nab('ParticipationFactory', [], input);
  const policyManagerFactory = await nab('PolicyManagerFactory', [], input);
  const sharesFactory = await nab('SharesFactory', [], input);
  const tradingFactory = await nab('TradingFactory', [], input);
  const vaultFactory = await nab('VaultFactory', [], input);
  const registry = await nab('Registry', [melonConf.registryOwner], input);
  const engine = await nab('Engine', [melonConf.engineDelay, registry.options.address], input);
  const fundRanking = await nab('FundRanking', [], input);

  let priceSource;
  if (conf.track === 'KYBER_PRICE') {
    priceSource = await nab('KyberPriceFeed', [
      registry.options.address, kyberAddrs.KyberNetworkProxy,
      melonConf.maxSpread, tokenAddrs.WETH
    ], input);
  } else if (conf.track === 'TESTING') {
    priceSource = await nab('TestingPriceFeed', [tokenAddrs.WETH], input);
  }

  await send(registry, 'setPriceSource', [priceSource.options.address]);
  await send(registry, 'setNativeAsset', [tokenAddrs.WETH]);
  await send(registry, 'setMlnToken', [tokenAddrs.MLN]);
  await send(registry, 'setEngine', [engine.options.address]);
  await send(registry, 'setMGM', [defaultMGM]);
  await send(registry, 'setEthfinexWrapperRegistry', [defaultEthfinexWrapperRegistry]);
  await send(registry, 'registerFees', [[ managementFee.options.address, performanceFee.options.address]]);

  const sigs = [
    'makeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
    'takeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
    'cancelOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
    'withdrawTokens(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
  ].map(s => web3.utils.keccak256(s).slice(0,10));

  for (const exchange of Object.values(exchanges)) {
    const isRegistered = await call(registry, 'exchangeAdapterIsRegistered', [exchange.adapter]);
    if (isRegistered) {
      await send(registry, 'updateExchangeAdapter', [exchange.exchange, exchange.adapter, exchange.takesCustody, sigs]);
    } else {
      await send(registry, 'registerExchangeAdapter', [exchange.exchange, exchange.adapter, exchange.takesCustody, sigs]);
    }
  }

  for (const [sym, info] of Object.entries(tokenConf)) {
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
  ], input);

  if (conf.track === 'KYBER_PRICE')
    await send(priceSource, 'update');
  else if (conf.track === 'TESTING') {
    // TODO: get prices
    await send(priceSource, 'update', []);
  }

  return {
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
  };
}

if (require.main === module) {
  //TODO: NEXT: copy file in first place
  main().then(a => {
    fs.writeFileSync(deploy_out, JSON.stringify(addrs, null, '  '));
    console.log(`Written to ${deploy_out}`);
    console.log(addrs);
    process.exit
  }).catch(console.error);
}

module.exports = main;
