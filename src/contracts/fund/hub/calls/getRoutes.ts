import { Address } from '@melonproject/token-math/address';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

// TODO: Share interfaces between .sol and .ts?
//  Code generation out of solidity AST?
export interface Routes {
  accountingAddress: Address;
  feeManagerAddress: Address;
  participationAddress: Address;
  policyManagerAddress: Address;
  priceSourceAddress: Address;
  registryAddress: Address;
  sharesAddress: Address;
  tradingAddress: Address;
  vaultAddress: Address;
  versionAddress: Address;
}

export const getRoutes = async (
  environment: Environment,
  hubAddress: Address,
): Promise<Routes> => {
  const hubContract = await getContract(environment, Contracts.Hub, hubAddress);

  const routes = await hubContract.methods.routes().call();

  const components = {
    accountingAddress: new Address(routes.accounting),
    feeManagerAddress: new Address(routes.feeManager),
    participationAddress: new Address(routes.participation),
    policyManagerAddress: new Address(routes.policyManager),
    priceSourceAddress: new Address(routes.priceSource),
    registryAddress: new Address(routes.registry),
    sharesAddress: new Address(routes.shares),
    tradingAddress: new Address(routes.trading),
    vaultAddress: new Address(routes.vault),
    versionAddress: new Address(routes.version),
  };

  return components;
};
