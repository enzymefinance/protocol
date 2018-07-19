import web3 from "../../lib/web3";
import * as masterConfig from "../../config/environment";
import {deployContract} from "../../lib/contracts";

async function deploy(environment, previous={}) {
  let opts;
  const deployed = {};
  const config = masterConfig[environment];
  switch (environment) {
    case 'development':
      const accounts = await web3.eth.getAccounts();
      opts = Object.freeze({from: accounts[0], gas: 1000000});
      deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
      deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [accounts[0]]);
      break;
    case 'kovan-demo':
      opts = Object.freeze({
        from: config.protocol.deployer,
        gas: config.gas,
        gasPrice: config.gasPrice
      });
      deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
      deployed.NoComplianceCompetition = await deployContract("compliance/NoComplianceCompetition", opts);
      deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [config.protocol.deployer]);
      deployed.OnlyManagerCompetition = await deployContract("compliance/OnlyManagerCompetition", opts);
      break;
    case 'kovan-competition':
      opts = Object.freeze({
        from: config.protocol.deployer,
        gas: config.gas,
        gasPrice: config.gasPrice
      });
      deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
      deployed.NoComplianceCompetition = await deployContract("compliance/NoComplianceCompetition", opts);
      deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [config.protocol.deployer]);
      deployed.OnlyManagerCompetition = await deployContract("compliance/OnlyManagerCompetition", opts);
      break;
    case 'live-competition':
      opts = Object.freeze({
        from: config.protocol.deployer,
        gas: config.gas,
        gasPrice: config.gasPrice
      });
      deployed.BugBountyCompliance = await deployContract("compliance/BugBountyCompliance", opts);
      deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [config.protocol.deployer]);
      break;
  }
  return Object.assign(previous, deployed);
}

export default deploy;

