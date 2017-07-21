const Version = artifacts.require('./Version.sol');
const Governance = artifacts.require('./Governance.sol');

module.exports = async (deployer) => {
  await deployer.deploy(Governance).then(() => deployer.deploy(Version, Governance.address));
};
