const Version = artifacts.require("./Version.sol");
const Governance = artifacts.require("./Governance.sol");

module.exports = (deployer) => {
  // Deploy meta strucutre
  deployer.deploy(Governance).then(() => deployer.deploy(Version, Governance.address));
};
