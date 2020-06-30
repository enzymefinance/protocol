const ManagementFee = artifacts.require('ManagementFee');
const PerformanceFee = artifacts.require('PerformanceFee');

module.exports = async deployer => {
  await deployer.deploy(ManagementFee);
  await deployer.deploy(PerformanceFee);
}
