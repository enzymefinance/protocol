const KyberAdapter = artifacts.require('KyberAdapter');
const OasisDexAdapter = artifacts.require('OasisDexAdapter');
const UniswapAdapter = artifacts.require('UniswapAdapter');
const ZeroExV2Adapter = artifacts.require('ZeroExV2Adapter');
const ZeroExV3Adapter = artifacts.require('ZeroExV3Adapter');
const EngineAdapter = artifacts.require('EngineAdapter');
const AirSwapAdapter = artifacts.require('AirSwapSwap');

module.exports = async deployer => {
  await deployer.deploy(KyberAdapter);
  await deployer.deploy(OasisDexAdapter);
  await deployer.deploy(UniswapAdapter);
  await deployer.deploy(ZeroExV2Adapter);
  await deployer.deploy(ZeroExV3Adapter);
  // await deployer.deploy(AirSwapAdapter); // TODO
  await deployer.deploy(EngineAdapter);
}
