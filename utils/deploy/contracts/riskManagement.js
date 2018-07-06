import {deployContract} from "../../lib/contracts";

async function deploy(environment, accounts=[], previous={}) {
  const deployed = {};
  const opts = Object.freeze({from: accounts[0], gas: 1000000});
  switch (environment) {
    case 'development':
      deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
      deployed.NoRiskMgmt = await deployContract("riskmgmt/NoRiskMgmt", opts);
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
  return deployed;
}

export default deploy;
