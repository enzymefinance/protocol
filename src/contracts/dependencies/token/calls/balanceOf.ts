import { Quantity } from '@melonproject/token-math';

import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';
import getToken from './getToken';
import getTokenContract from '../utils/getContract';

const balanceOf = async (
  contractAddress,
  { address },
  environment = getGlobalEnvironment(),
) => {
  const contract = getTokenContract(contractAddress, environment);
  const tokenMathToken = await getToken(contractAddress, environment);
  const result = await contract.methods.balanceOf(address).call();
  return Quantity.createQuantity(tokenMathToken, result);
};

export default balanceOf;
