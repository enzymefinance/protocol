import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';
import { Address } from '~/utils/types';

import getHubContract from '../utils/getHubContract';

// TODO: Share interfaces between .sol and .ts? Code generation out of solidity AST?
export interface Settings {
  accountingAddress: Address;
  feeManagerAddress: Address;
  participationAddress: Address;
  policyManagerAddress: Address;
  sharesAddress: Address;
  tradingAddress: Address;
  vaultAddress: Address;
  priceSourceAddress: Address;
  registrarAddress: Address;
  versionAddress: Address;
}

const getSettings = async (
  hubAddress: Address,
  environment = getGlobalEnvironment(),
): Promise<Settings> => {
  const hubContract = await getHubContract(hubAddress, environment);

  const settings = await hubContract.settings.call();

  const components = {
    accountingAddress: new Address(settings.accounting),
    feeManagerAddress: new Address(settings.feeManager),
    participationAddress: new Address(settings.participation),
    policyManagerAddress: new Address(settings.policyManager),
    sharesAddress: new Address(settings.shares),
    tradingAddress: new Address(settings.trading),
    vaultAddress: new Address(settings.vault),
    priceSourceAddress: new Address(settings.priceSource),
    registrarAddress: new Address(settings.canonicalRegistrar),
    versionAddress: new Address(settings.version),
  };

  return components;
};

export default getSettings;
