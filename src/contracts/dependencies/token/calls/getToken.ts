import { TokenInterface, Address } from '@melonproject/token-math';
import { getInfo } from './getInfo';
import { Environment } from '~/utils/environment/Environment';

export const getToken = async (
  environment: Environment,
  contractAddress: Address,
): Promise<TokenInterface> => {
  const info = await getInfo(environment, contractAddress);

  return {
    address: contractAddress.toString(),
    decimals: info.decimals,
    symbol: info.symbol,
  };
};
