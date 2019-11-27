const {call, fetchContract} = require('../../../../deploy/utils/deploy-contract');

const getFundComponents = async hubAddress => {
  const components = {};
  components.hub = fetchContract('Hub', hubAddress);
  const routes = await call(components.hub, 'routes');
  components.accounting = fetchContract('Accounting', routes.accounting);
  components.feeManager = fetchContract('FeeManager', routes.feeManager);
  components.participation = fetchContract('Participation', routes.participation);
  components.policyManager = fetchContract('PolicyManager', routes.policyManager);
  components.shares = fetchContract('Shares', routes.shares);
  components.trading = fetchContract('Trading', routes.trading);
  components.vault = fetchContract('Vault', routes.vault);
  return components;
}

module.exports = getFundComponents;
