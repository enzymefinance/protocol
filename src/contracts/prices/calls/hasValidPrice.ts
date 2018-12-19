import { TokenInterface } from '@melonproject/token-math/token';
import { Environment } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const hasValidPrice = async (
  environment: Environment,
  contractAddress: string,
  token: TokenInterface,
): Promise<boolean> => {
  const contract = await getContract(
    environment,
    Contracts.PriceSourceInterface,
    contractAddress,
  );

  return contract.methods.hasValidPrice(token.address).call();
};
