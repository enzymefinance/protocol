import web3 from "../../lib/web3";
import {deployContract} from "../../lib/contracts";

async function deploy(environment, previous={}) {
  const deployed = {};
  const accounts = await web3.eth.getAccounts();
  const opts = Object.freeze({from: accounts[0], gas: 1000000});
  switch (environment) {
    case 'development':
      deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
      deployed.NoRiskMgmt = await deployContract("riskmgmt/RiskMgmt", opts);
      break;
    case 'kovan-demo':
      deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
      deployed.NoRiskMgmt = await deployContract("riskmgmt/NoRiskMgmt", opts);
      break;
    case 'kovan-competition':
      deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
      deployed.NoRiskMgmt = await deployContract("riskmgmt/NoRiskMgmt", opts);
      break;
    case 'live-competition':
      deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
      deployed.NoRiskMgmt = await deployContract("riskmgmt/NoRiskMgmt", opts);
      break;
  }
  return Object.assign(previous, deployed);
}

export default deploy;
