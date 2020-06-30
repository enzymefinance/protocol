const mainnetAddrs = require('../config');
const Registry = artifacts.require('Registry');
const ManagementFee = artifacts.require('ManagementFee');
const PerformanceFee = artifacts.require('PerformanceFee');
const WETH = artifacts.require('WETH');
const MLN = artifacts.require('MLN');

module.exports = async (deployer, _, [admin]) => {
  await deployer.deploy(Registry, admin);

  const registry = await Registry.deployed();
  await registry.setMGM(mainnetAddrs.melon.MelonInitialMGM);

  const weth = await WETH.at(mainnetAddrs.tokens.WETH);
  const mln = await MLN.at(mainnetAddrs.tokens.MLN);
  await registry.setNativeAsset(weth.address);
  await registry.setMlnToken(mln.address);

  const managementFee = await ManagementFee.deployed();
  const performanceFee = await PerformanceFee.deployed();
  await registry.registerFee(managementFee.address);
  await registry.registerFee(performanceFee.address);
}
