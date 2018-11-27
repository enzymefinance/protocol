import { TokenInterface } from '@melonproject/token-math/token';
import { getInfo } from './getInfo';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getToken = async (
  contractAddress,
  environment?,
): Promise<TokenInterface> => {
  const contract = getContract(
    Contracts.PreminedToken,
    contractAddress,
    environment,
  );
  const info = await getInfo(contractAddress, environment);

  return {
    address: contract.options.address,
    decimals: info.decimals,
    symbol: info.symbol,
  };
};
