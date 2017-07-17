const Rewards = artifacts.require('./Rewards.sol');

module.exports = async (deployer) => {
  await deployer.deploy(Rewards, [0, 0]);
};
