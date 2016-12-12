module.exports = (deployer) => {
  // Deploy meta strucutre
  deployer.deploy(Meta).then(() => deployer.deploy(Version, Meta.address));
};
