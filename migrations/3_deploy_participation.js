const Subscribe = artifacts.require('./Subscribe.sol');
const Redeem = artifacts.require('./Redeem.sol');

module.exports = (deployer) => {
  deployer.deploy([
    [Subscribe],
    [Redeem],
  ]);
};
