const ManagementFee = artifacts.require('./ManagementFee.sol');
const PerformanceFee = artifacts.require('./PerformanceFee.sol');

module.exports = (deployer) => {
  deployer.deploy([
    ManagementFee,
    PerformanceFee,
  ]);
};
