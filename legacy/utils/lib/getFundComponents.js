import {retrieveContract} from "../../utils/lib/contracts";

async function getFundComponents(hubAddress) {
  let components = {};
  components.hub = await retrieveContract("Hub", hubAddress);
  const participationAddress = await components.hub.methods.participation().call();
  const sharesAddress = await components.hub.methods.shares().call();
  const tradingAddress = await components.hub.methods.trading().call();
  const policyManagerAddress = await components.hub.methods.policyManager().call();
  components.participation = await retrieveContract("Participation", participationAddress);
  components.shares = await retrieveContract("Shares", sharesAddress);
  components.trading = await retrieveContract("Trading", tradingAddress);
  components.policyManager = await retrieveContract("PolicyManager", policyManagerAddress);
  const routes = await components.hub.methods.settings().call();
  components = Object.assign(components, {
    accounting: await retrieveContract("Accounting", routes.accounting),
    feeManager: await retrieveContract("FeeManager", routes.feeManager),
    participation: await retrieveContract("Participation", routes.participation),
    policyManager: await retrieveContract("PolicyManager", routes.policyManager),
    shares: await retrieveContract("Shares", routes.shares),
    trading: await retrieveContract("Trading", routes.trading),
    vault: await retrieveContract("Vault", routes.vault),
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
