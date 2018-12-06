import { TokenInterface } from '@melonproject/token-math/token';
import { Environment } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const hasRecentPrice = async (
  contractAddress: string,
  token: TokenInterface,
  environment?: Environment,
): Promise<boolean> => {
  const contract = await getContract(
    Contracts.PriceSourceInterface,
    contractAddress,
    environment,
  );

  return contract.methods.hasRecentPrice(token.address).call();
};
