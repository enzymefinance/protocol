const Participation = artifacts.require('./Participation.sol');
const RiskMgmt = artifacts.require('./RiskMgmt.sol');
const RMMakeOrders = artifacts.require('./RMMakeOrders.sol');

module.exports = (deployer, network) => {
  try {
    if (network === 'development') {
      deployer.deploy(Participation)
      .then(() => deployer.deploy(RiskMgmt))
    } else if (network === 'kovan') {
      deployer.deploy(Participation)
      .then(() => deployer.deploy(RMMakeOrders))
      .catch(e => { throw e; });
    }
  } catch (e) {
    throw e;
  }
};
