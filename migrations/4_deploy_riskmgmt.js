const RiskMgmt = artifacts.require('./RiskMgmt.sol');

module.exports = (deployer) => {
  deployer.deploy(RiskMgmt);
};
