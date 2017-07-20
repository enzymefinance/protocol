const Version = artifacts.require('./Version.sol');
const Governance = artifacts.require('./Governance.sol');

module.exports = async (deployer) => {
  // Deploy meta strucutre
  await deployer.deploy(Governance).then(() => deployer.deploy(Version, Governance.address));
};
