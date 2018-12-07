import { Address } from '@melonproject/token-math/address';
import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

interface VersionArgs {
  accountingFactoryAddress: Address;
  feeManagerFactoryAddress: Address;
  participationFactoryAddress: Address;
  sharesFactoryAddress: Address;
  tradingFactoryAddress: Address;
  vaultFactoryAddress: Address;
  policyManagerFactoryAddress: Address;
  engineAddress: Address;
  factoryPriceSourceAddress: Address;
  mlnTokenAddress: Address;
  registryAddress: Address;
}

export const deployVersion = async (
  addresses: VersionArgs,
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
    registryAddress,
  } = addresses;

  const argsRaw = [
    accountingFactoryAddress,
    feeManagerFactoryAddress,
    participationFactoryAddress,
    sharesFactoryAddress,
    tradingFactoryAddress,
    vaultFactoryAddress,
    policyManagerFactoryAddress,
    engineAddress,
    factoryPriceSourceAddress,
    mlnTokenAddress,
    registryAddress,
  ];

  const args = argsRaw.map(a => a.toString());

  const address = await deployContract(Contracts.Version, args, environment);

  return address;
};
