const KyberAdapter = artifacts.require('KyberAdapter');
const OasisDexAdapter = artifacts.require('OasisDexAdapter');
const UniswapAdapter = artifacts.require('UniswapAdapter');
const ZeroExV2Adapter = artifacts.require('ZeroExV2Adapter');
const ZeroExV3Adapter = artifacts.require('ZeroExV3Adapter');
const EngineAdapter = artifacts.require('EngineAdapter');
const AirSwapAdapter = artifacts.require('AirSwapAdapter');
const ChaiAdapter = artifacts.require('ChaiAdapter');
const Engine = artifacts.require('Engine');
const Registry = artifacts.require('Registry');

const mainnetAddrs = require('../config');

module.exports = async deployer => {
  const registryAddress = (await Registry.deployed()).address;

  await deployer.deploy(KyberAdapter, registryAddress, mainnetAddrs.kyber.KyberNetworkProxy);
  await deployer.deploy(OasisDexAdapter, registryAddress, mainnetAddrs.oasis.OasisDexExchange);
  await deployer.deploy(UniswapAdapter, registryAddress, mainnetAddrs.uniswap.UniswapFactory);
  await deployer.deploy(ZeroExV2Adapter, registryAddress, mainnetAddrs.zeroExV2.ZeroExV2Exchange);
  await deployer.deploy(ZeroExV3Adapter, registryAddress, mainnetAddrs.zeroExV3.ZeroExV3Exchange);
  await deployer.deploy(AirSwapAdapter, registryAddress, mainnetAddrs.airSwap.AirSwapSwap);
  await deployer.deploy(EngineAdapter, registryAddress, (await Engine.deployed()).address);
  await deployer.deploy(ChaiAdapter, registryAddress, mainnetAddrs.chai.ChaiToken, mainnetAddrs.tokens.DAI);
}
