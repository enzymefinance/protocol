import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getFundComponents = async hubAddress => {
  let components: any = {};
  components.hub = await getContract(Contracts.Hub, hubAddress);
  const routes = await components.hub.methods.settings().call();
  components = Object.assign(components, {
    accounting: await getContract(Contracts.Accounting, routes.accounting),
    engine: await getContract(Contracts.Engine, routes.engine),
    feeManager: await getContract(Contracts.FeeManager, routes.feeManager),
    participation: await getContract(
      Contracts.Participation,
      routes.participation,
    ),
    policyManager: await getContract(
      Contracts.PolicyManager,
      routes.policyManager,
    ),
    priceSource: await getContract(
      Contracts.PriceSourceInterface,
      routes.priceSource,
    ),
    registry: await getContract(Contracts.Registry, routes.registry),
    shares: await getContract(Contracts.Shares, routes.shares),
    trading: await getContract(Contracts.Trading, routes.trading),
    vault: await getContract(Contracts.Vault, routes.vault),
    version: await getContract(Contracts.Version, routes.version),
  });
  return components;
};
