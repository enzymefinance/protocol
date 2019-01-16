import { Address } from '@melonproject/token-math';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const managersToRoutes = async (
  environment: Environment,
  contractAddress: Address,
  managerAddress: Address,
) => {
  const contract = getContract(
    environment,
    Contracts.FundFactory,
    contractAddress,
  );

  const routes = await contract.methods
    .managersToRoutes(managerAddress.toString())
    .call();

  return routes;
};
