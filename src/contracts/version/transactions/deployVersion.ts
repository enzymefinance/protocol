import { Address } from '@melonproject/token-math/address';
import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

interface VersionArgs {
  governanceAddress: Address;
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
}

export const deployVersion = async (
  addresses: VersionArgs,
  environment?: Environment,
) => {
  const {
    governanceAddress,
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
  } = addresses;

  const argsRaw = [
    governanceAddress,
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
  ];

  const args = argsRaw.map(a => a.toString());

  const address = await deployContract(
    'version/Version.sol',
    args,
    environment,
  );

  return address;
};
