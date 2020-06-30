const KyberAdapter = artifacts.require('KyberAdapter');
const OasisDexAdapter = artifacts.require('OasisDexAdapter');
const UniswapAdapter = artifacts.require('UniswapAdapter');
const ZeroExV2Adapter = artifacts.require('ZeroExV2Adapter');
const ZeroExV3Adapter = artifacts.require('ZeroExV3Adapter');
const EngineAdapter = artifacts.require('EngineAdapter');
const AirSwapAdapter = artifacts.require('AirSwapAdapter');
const Engine = artifacts.require('Engine');

const mainnetAddrs = require('../config');

module.exports = async deployer => {
  await deployer.deploy(KyberAdapter, mainnetAddrs.kyber.KyberNetworkProxy);
  await deployer.deploy(OasisDexAdapter, mainnetAddrs.oasis.OasisDexExchange);
  await deployer.deploy(UniswapAdapter, mainnetAddrs.uniswap.UniswapFactory);
  await deployer.deploy(ZeroExV2Adapter, mainnetAddrs.zeroExV2.ZeroExV2Exchange);
  await deployer.deploy(ZeroExV3Adapter, mainnetAddrs.zeroExV3.ZeroExV3Exchange);
  await deployer.deploy(AirSwapAdapter, mainnetAddrs.airSwap.AirSwapSwap);
  await deployer.deploy(EngineAdapter, (await Engine.deployed()).address);
}
