const Participation = artifacts.require('./Participation.sol');

module.exports = (deployer) => {
  deployer.deploy(Participation);
};
