const conf = require('../deploy-config.js');
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

const Registry = artifacts.require('Registry');
const ManagementFee = artifacts.require('ManagementFee');
const PerformanceFee = artifacts.require('PerformanceFee');
const WETH = artifacts.require('WETH');
const MLN = artifacts.require('MLN');

module.exports = async deployer => {
  const weth = await WETH.at(mainnetAddrs.tokens.WETH);
  const mln = await MLN.at(mainnetAddrs.tokens.MLN);
  const registry = await deployer.deploy(Registry, conf.melonRegistryOwner);
  await registry.setMGM(conf.melonInitialMGM);
  await registry.registerFee((await ManagementFee.deployed()).address);
  await registry.registerFee((await PerformanceFee.deployed()).address);
  await registry.setNativeAsset(weth.address);
  await registry.setMlnToken(mln.address);
}
