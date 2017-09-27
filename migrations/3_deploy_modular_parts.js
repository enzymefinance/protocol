const Participation = artifacts.require('./Participation.sol');
const ParticipationOpen = artifacts.require('./ParticipationOpen.sol');
const RiskMgmt = artifacts.require('./RiskMgmt.sol');
const RMMakeOrders = artifacts.require('./RMMakeOrders.sol');

module.exports = (deployer, network) => {
  try {
    if (network !== 'development') {
      deployer.deploy(ParticipationOpen)
      .then(() => deployer.deploy(RMMakeOrders))
    } else {
      deployer.deploy(Participation)
      .then(() => deployer.deploy(RiskMgmt))
    }
  } catch (e) {
    throw e;
  }
};
