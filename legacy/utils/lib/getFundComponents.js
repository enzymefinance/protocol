import {retrieveContract} from "../../utils/lib/contracts";

async function getFundComponents(hubAddress) {
  let components = {};
  components.hub = await retrieveContract("fund/hub/Hub", hubAddress);
  const participationAddress = await components.hub.methods.participation().call();
  const sharesAddress = await components.hub.methods.shares().call();
  const tradingAddress = await components.hub.methods.trading().call();
  const policyManagerAddress = await components.hub.methods.policyManager().call();
  components.participation = await retrieveContract("fund/participation/Participation", participationAddress);
  components.shares = await retrieveContract("fund/shares/Shares", sharesAddress);
  components.trading = await retrieveContract("fund/trading/Trading", tradingAddress);
  components.policyManager = await retrieveContract("fund/policies/PolicyManager", policyManagerAddress);
  const routes = await components.hub.methods.settings().call();
  components = Object.assign(components, {
    accounting: await retrieveContract("fund/accounting/Accounting", routes.accounting),
    feeManager: await retrieveContract("fund/fees/FeeManager", routes.feeManager),
    participation: await retrieveContract("fund/participation/Participation", routes.participation),
    policyManager: await retrieveContract("fund/policies/PolicyManager", routes.policyManager),
    shares: await retrieveContract("fund/shares/Shares", routes.shares),
    trading: await retrieveContract("fund/trading/Trading", routes.trading),
    vault: await retrieveContract("fund/vault/Vault", routes.vault),
  });

  console.log(`Hub: ${hubAddress}`);
  console.log(`Participation: ${participationAddress}`);
  console.log(`Trading: ${tradingAddress}`);
  console.log(`Shares: ${sharesAddress}`);
  console.log(`PolicyManager: ${policyManagerAddress}`);
  console.log(`Accounting: ${routes.accounting}`);

  return components;
}

export default getFundComponents;
