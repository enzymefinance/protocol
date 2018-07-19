import web3 from "../../lib/web3";
import {deployContract} from "../../lib/contracts";

async function deploy(environment, previous={}) {
  const deployed = {};
  const accounts = await web3.eth.getAccounts();
  const opts = Object.freeze({from: accounts[0], gas: 6000000});
  switch (environment) {
    case 'development':
      deployed.Version = await deployContract(
        "version/Version",
        opts,
        [
          "0.8.0", previous.Governance.options.address, previous.MlnToken.options.address,
          previous.EthToken.options.address, previous.CanonicalPriceFeed.options.address,
          previous.CompetitionCompliance.options.address
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
  return Object.assign(previous, deployed);
}

export default deploy;


