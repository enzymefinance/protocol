import { Address } from '@melonproject/token-math/address';

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
  engineAddress: Address;
  factoryPriceSourceAddress: Address;
  mlnTokenAddress: Address;
}

export const deployFundFactory = async (
  environment: Environment,
  addresses: FundComponentAddresses,
) => {
  const {
    accountingFactoryAddress,
    engineAddress,
    factoryPriceSourceAddress,
    feeManagerFactoryAddress,
    mlnTokenAddress,
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
    engineAddress,
    factoryPriceSourceAddress,
    mlnTokenAddress,
  ];

  const args = argsRaw.map(a => a.toString());

  const address = await deployContract(
    environment,
    Contracts.FundFactory,
    args,
  );

  return address;
};
