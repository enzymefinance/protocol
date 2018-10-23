import { createQuantity } from '@melonproject/token-math/quantity';

import { getGlobalEnvironment } from '~/utils/environment';
import { getToken } from '..';
import { Contract, getContract } from '~/utils/solidity';

export const balanceOf = async (
  contractAddress,
  { address },
  environment = getGlobalEnvironment(),
) => {
  const contract = getContract(
    Contract.PreminedToken,
    contractAddress,
    environment,
  );
  const tokenMathToken = await getToken(contractAddress, environment);
  const result = await contract.methods.balanceOf(address).call();
  return createQuantity(tokenMathToken, result);
};
