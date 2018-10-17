import { Quantity } from '@melonproject/token-math';

import { getGlobalEnvironment } from '~/utils/environment';
import { getContract, getToken } from '..';

export const balanceOf = async (
  contractAddress,
  { address },
  environment = getGlobalEnvironment(),
) => {
  const contract = getContract(contractAddress, environment);
  const tokenMathToken = await getToken(contractAddress, environment);
  const result = await contract.methods.balanceOf(address).call();
  return Quantity.createQuantity(tokenMathToken, result);
};
