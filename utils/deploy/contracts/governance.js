import {deployContract} from "../../lib/contracts";

async function deploy(environment, accounts=[], previous={}) {
  const deployed = {};
  const opts = Object.freeze({from: accounts[0], gas: 1000000});
  switch (environment) {
    case 'development':
      deployed.Governance = await deployContract("system/Governance", opts, [[accounts[0]], 1, 100000]);
      break;
    case 'kovan-demo':
      deployed.Governance = await deployContract("system/Governance", opts, [[deploymentAddress], 1, yearInSeconds]);
      break;
    case 'kovan-competition':
      deployed.Governance = await deployContract("system/Governance", opts, [[deploymentAddress], 1, yearInSeconds]);
      break;
    case 'live-competition':
      deployed.Governance = await retrieveContract("system/Governance", "0x630f5e265112dB10D1e7820E26718172a12BD084");
      break;
  }
  return deployed;
}

export default deploy;



