import { Address } from '@melonproject/token-math/address';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const childExists = async (
  environment: Environment,
  contractAddress: Address,
  fundAddress: Address,
) => {
  const contract = getContract(
    environment,
    Contracts.FundFactory,
    contractAddress,
  );

  const isComplete = await contract.methods
    .childExists(fundAddress.toString())
    .call();

  return isComplete;
};
