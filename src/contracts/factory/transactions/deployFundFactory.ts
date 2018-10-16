import { Address } from '~/utils/types';
import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

import { FundComponentAddresses } from '~/contracts/fund/types';

const deployFundFactory = async (
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

export default deployFundFactory;
