const Rewards = artifacts.require('./Rewards.sol');

module.exports = (deployer) => {
  deployer.deploy(Rewards, [0, 0]);
};
