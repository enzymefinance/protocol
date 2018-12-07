import { Address } from '@melonproject/token-math/address';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

// TODO: Share interfaces between .sol and .ts?
//  Code generation out of solidity AST?
export interface Settings {
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

export const getSettings = async (
  environment: Environment,
  hubAddress: Address,
): Promise<Settings> => {
  const hubContract = await getContract(environment, Contracts.Hub, hubAddress);

  const settings = await hubContract.methods.settings().call();

  const components = {
    accountingAddress: new Address(settings.accounting),
    feeManagerAddress: new Address(settings.feeManager),
    participationAddress: new Address(settings.participation),
    policyManagerAddress: new Address(settings.policyManager),
    priceSourceAddress: new Address(settings.priceSource),
    registryAddress: new Address(settings.registry),
    sharesAddress: new Address(settings.shares),
    tradingAddress: new Address(settings.trading),
    vaultAddress: new Address(settings.vault),
    versionAddress: new Address(settings.version),
  };

  return components;
};
