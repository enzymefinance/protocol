const Participation = artifacts.require('./Participation.sol');

module.exports = async (deployer) => {
  await deployer.deploy(Participation);
};
