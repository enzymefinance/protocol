import { createQuantity, QuantityInterface } from '@melonproject/token-math';
import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from './getToken';

const prepareArgs = (_, { owner, spender }) => [`${owner}`, `${spender}`];

const postProcess = async (
  environment,
  result,
  prepared,
): Promise<QuantityInterface> => {
  const token = await getToken(environment, prepared.contractAddress);
  const quantity = createQuantity(token, `${result}`);
  return quantity;
};

export const allowance = callFactory('allowance', Contracts.PreminedToken, {
  postProcess,
  prepareArgs,
});
