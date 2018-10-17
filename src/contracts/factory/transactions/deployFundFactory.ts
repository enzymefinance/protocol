import { Address } from '~/utils/types';
import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

interface FundComponentAddresses {
  accountingFactoryAddress: Address;
  feeManagerFactoryAddress: Address;
  participationFactoryAddress: Address;
  sharesFactoryAddress: Address;
  tradingFactoryAddress: Address;
  vaultFactoryAddress: Address;
  policyManagerFactoryAddress: Address;
}

export const deployFundFactory = async (
  addresses: FundComponentAddresses,
  environment?: Environment,
) => {
  const {
    accountingFactoryAddress,
    feeManagerFactoryAddress,
    participationFactoryAddress,
    sharesFactoryAddress,
    tradingFactoryAddress,
    vaultFactoryAddress,
    policyManagerFactoryAddress,
  } = addresses;

  const argsRaw = [
    accountingFactoryAddress,
    feeManagerFactoryAddress,
    participationFactoryAddress,
    sharesFactoryAddress,
    tradingFactoryAddress,
    vaultFactoryAddress,
    policyManagerFactoryAddress,
  ];

  const args = argsRaw.map(a => a.toString());

  const address = await deployContract(
    'factory/FundFactory.sol',
    args,
    environment,
  );

  return address;
};
