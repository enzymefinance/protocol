import web3 from "../../lib/web3";
import {deployContract} from "../../lib/contracts";

async function deploy(environment, previous={}) {
  const deployed = {};
  switch (environment) {
    case 'development':
      const accounts = await web3.eth.getAccounts();
      const opts = Object.freeze({from: accounts[0], gas: 6000000});
      deployed.EthToken = await deployContract("assets/PreminedAsset", opts);
      deployed.MlnToken = await deployContract("assets/PreminedAsset", opts);
      deployed.EurToken = await deployContract("assets/PreminedAsset", opts);
      break;
    default:
      console.warn(`Environment "${environment}" not found`);
  }
  return deployed;
}

export default deploy;
