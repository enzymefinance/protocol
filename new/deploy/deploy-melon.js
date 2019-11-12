const fs = require('fs');
const web3 = require('./get-web3');
const {call, deploy, send, nab} = require('./deploy-contract');
const deployIn = require('./get-deploy-input');

const deploy_in = './deploy_in.json'; // TODO: rename
const deploy_out = './melon_out.json'; // TODO: rename
const kyber_out = './kyber_out.json'; // TODO: rename

const main = async () => {
  const input = JSON.parse(fs.readFileSync(deploy_in));
  const conf = deployIn.conf;
  const tokenconf = deployIn.tokens;
  const exchanges = deployIn.exchangeConfigs;
  const tokenaddrs = JSON.parse(fs.readFileSync('./tokens_out.json')); // TODO: dynamic
  const kyber = JSON.parse(fs.readFileSync(kyber_out));

  const defaultMGM = conf.deployer;
  const defaultEthfinexWrapperRegistry = conf.deployer;

  const ethfinexAdapter = await nab('EthfinexAdapter', [], input);
  const kyberAdapter = await nab('KyberAdapter', [], input);
  const matchingMarketAdapter = await nab('MatchingMarketAdapter', [], input);
  const matchingMarketAccessor = await nab('MatchingMarketAccessor', [], input);
  const zeroExV2Adapter = await nab('ZeroExV2Adapter', [], input);
  const engineAdapter = await nab('EngineAdapter', [], input);
  const priceTolerance = await nab('PriceTolerance', [conf.priceTolerance], input);
  const userWhitelist = await nab('UserWhitelist', [conf.userWhitelist], input);
  const managementFee = await nab('ManagementFee', [], input);
  const performanceFee = await nab('PerformanceFee', [], input);
  const accountingFactory = await nab('AccountingFactory', [], input);
  const feeManagerFactory = await nab('FeeManagerFactory', [], input);
  const participationFactory = await nab('ParticipationFactory', [], input);
  const policyManagerFactory = await nab('PolicyManagerFactory', [], input);
  const sharesFactory = await nab('SharesFactory', [], input);
  const tradingFactory = await nab('TradingFactory', [], input);
  const vaultFactory = await nab('VaultFactory', [], input);
  const registry = await nab('Registry', [conf.registryOwner], input);
  const engine = await nab('Engine', [conf.engineDelay, registry.options.address], input);
  const fundRanking = await nab('FundRanking', [], input);

  let priceSource;
  if (conf.track === 'KYBER_PRICE') {
    priceSource = await nab('KyberPriceFeed', [
      registry.options.address, kyber.KyberNetworkProxy,
      conf.maxSpread, tokenaddrs.WETH
    ], input);
  } else if (conf.track === 'TESTING') {
    priceSource = await nab('TestingPriceFeed', [tokenaddrs.WETH], input);
  }

  await send(registry, 'setPriceSource', [priceSource.options.address]);
  await send(registry, 'setNativeAsset', [tokenaddrs.WETH]);
  await send(registry, 'setMlnToken', [tokenaddrs.MLN]);
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

  for (const [sym, token] of Object.entries(tokenconf)) {
    const tokenAddress = tokenaddrs[sym];
    const isRegistered = await call(registry, 'assetIsRegistered', [tokenAddress]);
    if (!isRegistered) {
      // TODO: fix token.sym and reserveMin
      const reserveMin = 0;
      await send(registry, 'registerAsset', [tokenAddress, token.name, sym, '', reserveMin, [], []]);
    }
    if (conf.track === 'TESTING') {
      await send(priceSource, 'setDecimals', [tokenAddress, token.decimals]);
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
    conf.versionOwner
  ], input);

  if (conf.track === 'KYBER_PRICE')
    await send(priceSource, 'update');
  else if (conf.track === 'TESTING') {
    // TODO: get prices
    await send(priceSource, 'update', []);
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
  };
  fs.writeFileSync(deploy_out, JSON.stringify(addrs, null, '  '));
  console.log(`Written to ${deploy_out}`);
  console.log(addrs);
}

main().then(process.exit).catch(console.error);
