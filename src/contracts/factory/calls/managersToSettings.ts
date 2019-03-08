import { Address } from '@melonproject/token-math';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const managersToSettings = async (
  environment: Environment,
  contractAddress: Address,
  managerAddress: Address,
) => {
  const contract = getContract(
    environment,
    Contracts.FundFactory,
    contractAddress,
  );

  const settings = await contract.methods
    .managersToSettings(managerAddress.toString())
    .call();

  return settings;
};
