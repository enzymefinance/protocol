import { Address } from '~/utils/types';
import { Environment } from '~/utils/environment/Environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';

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
  addresses: FundComponentAddresses,
  environment?: Environment,
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
    'factory/FundFactory.sol',
    args,
    environment,
  );

  return address;
};
