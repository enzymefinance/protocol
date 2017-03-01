const Version = artifacts.require("./Version.sol");
const Meta = artifacts.require("./Meta.sol");

module.exports = (deployer) => {
  // Deploy meta strucutre
  deployer.deploy(Meta).then(() => deployer.deploy(Version, Meta.address));
};
