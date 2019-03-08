import { Address } from '@melonproject/token-math';
import { Environment } from '~/utils/environment/Environment';
import { requireMap, Contracts } from '~/Contracts';

export const getContract = (
  environment: Environment,
  relativePath: Contracts,
  address: Address,
) => {
  const abi = requireMap[relativePath];
  const contract = new environment.eth.Contract(abi, `${address}`);
  return contract;
};
