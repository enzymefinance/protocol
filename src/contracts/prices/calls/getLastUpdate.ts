import { Address, TokenInterface } from '@melonproject/token-math';
import { Environment } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getLastUpdate = async (
  environment: Environment,
  contractAddress: Address,
): Promise<TokenInterface> => {
  const contract = await getContract(
    environment,
    Contracts.PriceSourceInterface,
    contractAddress,
  );
  const lastUpdate = await contract.methods.getLastUpdate().call();
  return lastUpdate;
};
