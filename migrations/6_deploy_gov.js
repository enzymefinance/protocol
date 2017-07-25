const Version = artifacts.require('./Version.sol');
const Governance = artifacts.require('./Governance.sol');

const tokenInfo = require('./config/token_info.js');

module.exports = async (deployer) => {
  const mlnTokenAddress = tokenInfo[network].find(t => t.symbol === 'MLN-T').address;
  await deployer.deploy(Governance)
      .then(() => deployer.deploy(Version, mlnTokenAddress, Governance.address));
};
