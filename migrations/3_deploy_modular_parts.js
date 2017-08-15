const Participation = artifacts.require('./Participation.sol');
const RiskMgmt = artifacts.require('./RiskMgmt.sol');
const RMLiquididtyProvider = artifacts.require('./RMLiquididtyProvider.sol');

module.exports = async (deployer, network) => {
  try {
    if (network === 'development') {
      deployer.deploy(Participation)
      .then(() => deployer.deploy(RiskMgmt))
    } else if (network === 'kovan') {
      await deployer.deploy(Participation);
      await deployer.deploy(RMLiquididtyProvider);
    }
  } catch (e) {
    throw e;
  }
};
