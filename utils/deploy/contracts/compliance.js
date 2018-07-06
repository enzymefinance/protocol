import * as masterConfig from "../../config/environment";
import {deployContract} from "../../lib/contracts";

async function deploy(environment, accounts=[], previous={}) {
  let opts;
  const deployed = {};
  const config = masterConfig[environment];
  switch (environment) {
    case 'development':
      opts = Object.freeze({from: accounts[0], gas: 1000000});
      deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
      deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts);
      break;
    case 'kovan-demo':
      opts = Object.freeze({
        from: config.protocol.deployer,
        gas: config.gas,
        gasPrice: config.gasPrice
      });
      deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
      deployed.NoComplianceCompetition = await deployContract("compliance/NoComplianceCompetition", opts);
      deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts);
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
      deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts);
      deployed.OnlyManagerCompetition = await deployContract("compliance/OnlyManagerCompetition", opts);
      break;
    case 'live-competition':
      opts = Object.freeze({
        from: config.protocol.deployer,
        gas: config.gas,
        gasPrice: config.gasPrice
      });
      deployed.BugBountyCompliance = await deployContract("compliance/BugBountyCompliance", opts);
      deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts);
      break;
  }
  return deployed;
}

export default deploy;

