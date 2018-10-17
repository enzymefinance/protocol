import { Quantity } from '@melonproject/token-math';

import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';
import getToken from './getToken';
import getContract from '../utils/getContract';

export const balanceOf = async (
  contractAddress,
  { address },
  environment = getGlobalEnvironment(),
) => {
  const contract = getTokenContract(contractAddress, environment);
  const tokenMathToken = await getToken(contractAddress, environment);
  const result = await contract.methods.balanceOf(address).call();
  return Quantity.createQuantity(tokenMathToken, result);
};
