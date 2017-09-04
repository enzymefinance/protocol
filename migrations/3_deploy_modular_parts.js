const Participation = artifacts.require('./Participation.sol');
const RiskMgmt = artifacts.require('./RiskMgmt.sol');
const RMLiquididtyProvider = artifacts.require('./RMLiquididtyProvider.sol');

module.exports = (deployer, network) => {
  try {
    if (network === 'development') {
      deployer.deploy(Participation)
      .then(() => deployer.deploy(RiskMgmt))
    } else if (network === 'kovan') {
      deployer.deploy(Participation)
      .then(() => deployer.deploy(RMLiquididtyProvider))
      .catch(e => { throw e; });
    }
  } catch (e) {
    throw e;
  }
};
