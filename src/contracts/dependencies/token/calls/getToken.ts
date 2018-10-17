import { IToken } from '@melonproject/token-math';
import { getContract, getInfo } from '..';

export const getToken = async (
  contractAddress,
  environment?,
): Promise<IToken> => {
  const contract = getContract(contractAddress, environment);
  const info = await getInfo(contractAddress, environment);

  return {
    address: contract.options.address,
    decimals: info.decimals,
    symbol: info.symbol,
  };
};
