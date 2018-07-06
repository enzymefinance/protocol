import {deployContract} from "../../lib/contracts";

async function deploy(environment, accounts=[], previous={}) {
  const deployed = {};
  const opts = Object.freeze({from: accounts[0], gas: 1000000});
  switch (environment) {
    case 'development':
      deployed.Version = await deployContract(
        "version/Version",
        opts,
        [
          pkgInfo.version, deployed.Governance.address, deployed.MlnToken.address,
          deployed.EthToken.address, deployed.CanonicalPriceFeed.address, deployed.CompetitionCompliance.address
        ],
        () => {}, true
      );
      break;
    case 'kovan-demo':
      deployed.Version = await deployContract(
        "version/Version",
        opts,
        [
          pkgInfo.version, deployed.Governance.address, mlnAddr,
          ethTokenAddress, deployed.CanonicalPriceFeed.address, complianceAddress
        ],
        () => {}, true
      );
      break;
    case 'kovan-competition':
      deployed.Version = await deployContract(
        "version/Version",
        opts,
        [
          pkgInfo.version, deployed.Governance.address, mlnAddr,
          ethTokenAddress, deployed.CanonicalPriceFeed.address, complianceAddress
        ],
        () => {}, true
      );
      break;
    case 'live-competition':
      deployed.Version = await deployContract(
        "version/Version",
        {from: deployer, gas: 6900000},
        [
          pkgInfo.version, deployed.Governance.address, mlnAddr, ethTokenAddress,
          deployed.CanonicalPriceFeed.address, deployed.CompetitionCompliance.address
        ], () => {}, true
      );
      break;
  }
  return deployed;
}

export default deploy;


