import { IToken } from '@melonproject/token-math';
import getContract from '../utils/getContract';

import getInfo from './getInfo';

const getToken = async (contractAddress, environment?): Promise<IToken> => {
  const contract = getContract(contractAddress, environment);
  const info = await getInfo(contractAddress, environment);

  return {
    address: contract.options.address,
    symbol: info.symbol,
    decimals: info.decimals,
  };
};

export default getToken;
