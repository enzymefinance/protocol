import { Address } from '@melonproject/token-math';

import { Environment } from '~/utils/environment/Environment';

import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';

interface FundComponentAddresses {
  accountingFactoryAddress: Address;
  feeManagerFactoryAddress: Address;
  participationFactoryAddress: Address;
  sharesFactoryAddress: Address;
  tradingFactoryAddress: Address;
  vaultFactoryAddress: Address;
  policyManagerFactoryAddress: Address;
  versionAddress: Address;
}

export const deployFundFactory = async (
  environment: Environment,
  addresses: FundComponentAddresses,
) => {
  const {
    accountingFactoryAddress,
    feeManagerFactoryAddress,
    participationFactoryAddress,
    policyManagerFactoryAddress,
    sharesFactoryAddress,
    tradingFactoryAddress,
    vaultFactoryAddress,
    versionAddress,
  } = addresses;

  const argsRaw = [
    accountingFactoryAddress,
    feeManagerFactoryAddress,
    participationFactoryAddress,
    sharesFactoryAddress,
    tradingFactoryAddress,
    vaultFactoryAddress,
    policyManagerFactoryAddress,
    versionAddress,
  ];

  const args = argsRaw.map(a => a.toString());

  const address = await deployContract(
    environment,
    Contracts.FundFactory,
    args,
  );

  return address;
};
