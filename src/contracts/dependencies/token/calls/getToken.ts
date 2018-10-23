import { TokenInterface } from '@melonproject/token-math/token';
import { getInfo } from '..';
import { Contract, getContract } from '~/utils/solidity';

export const getToken = async (
  contractAddress,
  environment?,
): Promise<TokenInterface> => {
  const contract = getContract(
    Contract.PreminedToken,
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
