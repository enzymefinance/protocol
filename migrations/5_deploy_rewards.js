const Rewards = artifacts.require('./Rewards.sol');

module.exports = aync (deployer) => {
  await deployer.deploy(Rewards, [0, 0]);
};
