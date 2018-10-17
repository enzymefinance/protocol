import { getGlobalEnvironment } from '~/utils/environment';
import { Address } from '~/utils/types';

import { getHubContract } from '..';

// TODO: Share interfaces between .sol and .ts?
//  Code generation out of solidity AST?
export interface Settings {
  accountingAddress: Address;
  feeManagerAddress: Address;
  participationAddress: Address;
  policyManagerAddress: Address;
  priceSourceAddress: Address;
  registrarAddress: Address;
  sharesAddress: Address;
  tradingAddress: Address;
  vaultAddress: Address;
  versionAddress: Address;
}

export const getSettings = async (
  hubAddress: Address,
  environment = getGlobalEnvironment(),
): Promise<Settings> => {
  const hubContract = await getHubContract(hubAddress, environment);

  const settings = await hubContract.methods.settings().call();

  const components = {
    accountingAddress: new Address(settings.accounting),
    feeManagerAddress: new Address(settings.feeManager),
    participationAddress: new Address(settings.participation),
    policyManagerAddress: new Address(settings.policyManager),
    priceSourceAddress: new Address(settings.priceSource),
    registrarAddress: new Address(settings.canonicalRegistrar),
    sharesAddress: new Address(settings.shares),
    tradingAddress: new Address(settings.trading),
    vaultAddress: new Address(settings.vault),
    versionAddress: new Address(settings.version),
  };

  return components;
};
