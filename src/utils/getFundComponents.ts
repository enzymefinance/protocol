import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getFundComponents = async (environment, hubAddress) => {
  let components: any = {};
  components.hub = await getContract(environment, Contracts.Hub, hubAddress);
  const routes = await components.hub.methods.routes().call();
  components = Object.assign(components, {
    accounting: await getContract(
      environment,
      Contracts.Accounting,
      routes.accounting,
    ),
    engine: await getContract(environment, Contracts.Engine, routes.engine),
    feeManager: await getContract(
      environment,
      Contracts.FeeManager,
      routes.feeManager,
    ),
    participation: await getContract(
      environment,
      Contracts.Participation,
      routes.participation,
    ),
    policyManager: await getContract(
      environment,
      Contracts.PolicyManager,
      routes.policyManager,
    ),
    priceSource: await getContract(
      environment,
      Contracts.PriceSourceInterface,
      routes.priceSource,
    ),
    registry: await getContract(
      environment,
      Contracts.Registry,
      routes.registry,
    ),
    shares: await getContract(environment, Contracts.Shares, routes.shares),
    trading: await getContract(environment, Contracts.Trading, routes.trading),
    vault: await getContract(environment, Contracts.Vault, routes.vault),
    version: await getContract(environment, Contracts.Version, routes.version),
  });
  return components;
};
