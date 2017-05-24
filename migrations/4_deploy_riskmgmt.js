const RiskMgmt = artifacts.require('./RiskMgmt.sol');
const RiskMgmtV1 = artifacts.require('./RiskMgmtV1.sol');

module.exports = (deployer, network) => {
  deployer.deploy(RiskMgmt);
  if (network == "kovan") {
    deployer.deploy(RiskMgmtV1);
  }
};
