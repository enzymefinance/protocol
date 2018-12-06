import { TokenInterface } from '@melonproject/token-math/token';
import { Environment } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

export const getQuoteToken = async (
  contractAddress: string,
  environment?: Environment,
): Promise<TokenInterface> => {
  const contract = await getContract(
    Contracts.PriceSourceInterface,
    contractAddress,
    environment,
  );
  const quoteTokenAddress = await contract.methods.getQuoteAsset().call();
  const token = await getToken(quoteTokenAddress, environment);
  return token;
};
