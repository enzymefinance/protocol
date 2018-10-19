import web3 from "../../lib/web3";
import {deployContract} from "../../lib/contracts";
import * as masterConfig from "../../config/environment";

async function deploy(environment, previous={}) {
  const deployed = {};
  const config = masterConfig[environment];
  const accounts = await web3.eth.getAccounts();
  const opts = Object.freeze({from: accounts[0], gas: 6000000});
  switch (environment) {
    case 'development':
      deployed.Governance = await deployContract("system/Governance", opts,
        [[accounts[0]], config.protocol.governance.quorum, config.protocol.governance.window]
      );
      break;
    case 'kovan-demo':
      deployed.Governance = await deployContract("system/Governance", opts, [
        [accounts[0]], config.protocol.governance.quorum, config.protocol.governance.window
      ]);
      break;
    case 'kovan-competition':
      deployed.Governance = await deployContract("system/Governance", opts, [[deploymentAddress], 1, yearInSeconds]);
      break;
    case 'live-competition':
      deployed.Governance = await retrieveContract("system/Governance", "0x630f5e265112dB10D1e7820E26718172a12BD084");
      break;
  }
  return Object.assign(previous, deployed);
}

export default deploy;



