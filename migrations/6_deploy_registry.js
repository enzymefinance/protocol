const mainnetAddrs = require('../config');
const Registry = artifacts.require('Registry');
const ManagementFee = artifacts.require('ManagementFee');
const PerformanceFee = artifacts.require('PerformanceFee');
const ERC20WithFields = artifacts.require("ERC20WithFields");

module.exports = async (deployer, _, [admin]) => {
  // TODO: 1st param should be real MTC
  // TODO: 2nd param should be real MGM
  await deployer.deploy(Registry, admin, mainnetAddrs.melon.MelonInitialMGM);

  const registry = await Registry.deployed();

  const weth = await ERC20WithFields.at(mainnetAddrs.tokens.WETH);
  const mln = await ERC20WithFields.at(mainnetAddrs.tokens.MLN);
  await registry.setNativeAsset(weth.address);
  await registry.setMlnToken(mln.address);

  const managementFee = await ManagementFee.deployed();
  const performanceFee = await PerformanceFee.deployed();
  await registry.registerFee(managementFee.address);
  await registry.registerFee(performanceFee.address);
}
