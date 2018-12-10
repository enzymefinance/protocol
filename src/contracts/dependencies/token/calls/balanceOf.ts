import { createQuantity } from '@melonproject/token-math/quantity';
import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from './getToken';

const prepareArgs = (_, { address }) => [address.toString()];
const postProcess = async (environment, result, prepared) => {
  const tokenMathToken = await getToken(environment, prepared.contractAddress);
  const quantity = createQuantity(tokenMathToken, result.toString());
  return quantity;
};

export const balanceOf = callFactory('balanceOf', Contracts.PreminedToken, {
  postProcess,
  prepareArgs,
});
