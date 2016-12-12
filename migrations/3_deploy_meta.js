module.exports = function(deployer) {
  // Deploy meta strucutre
  deployer.deploy(Meta).then(() => {
    return deployer.deploy(Version, Meta.address);
  });
};
