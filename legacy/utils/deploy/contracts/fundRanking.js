import web3 from "../../lib/web3";
import {deployContract} from "../../lib/contracts";

async function deploy(environment, previous={}) {
  const deployed = {};
  const accounts = await web3.eth.getAccounts();
  const opts = Object.freeze({from: accounts[0], gas: 6000000});
  switch (environment) {
    case 'development':
      deployed.FundRanking = await deployContract("FundRanking", opts);
      break;
    case 'kovan-demo':
      deployed.FundRanking = await deployContract("FundRanking", opts);
      break;
    case 'kovan-competition':
      deployed.FundRanking = await deployContract("FundRanking", opts);
      break;
    case 'live-competition':
      deployed.FundRanking = await deployContract("FundRanking", opts);
      break;
  }
  return Object.assign(previous, deployed);
}

export default deploy;




