const conf = require('../deploy-config.js');
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

const AirSwapAdapter = artifacts.require('AirSwapAdapter');
const AssetBlacklist = artifacts.require('AssetBlacklist');
const AssetWhitelist = artifacts.require('AssetWhitelist');
const Engine = artifacts.require('Engine');
const EngineAdapter = artifacts.require('EngineAdapter');
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
  const tokens = conf.tokens.map(symbol => mainnetAddrs.tokens[symbol].toLowerCase());
  const deregister = (await registry.getRegisteredPrimitives()).filter(address => {
    return !tokens.includes(address.toLowerCase());
  });

  await Promise.all(deregister.map(primitive => registry.deregisterPrimitive(primitive)));

  const sorted = await registry.getRegisteredPrimitives();
  const prices = await Promise.all(sorted.map(async (address) => {
    if (address.toLowerCase() === quoteAsset.toLowerCase()) {
      return web3.utils.toWei('1', 'ether');
    }

    return (await feed.getLiveRate(address, quoteAsset)).rate_;
  }));

  await feed.update(sorted, prices);
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
