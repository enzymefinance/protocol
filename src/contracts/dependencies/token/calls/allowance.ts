import {
  createQuantity,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import { callFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { getToken } from '..';

const prepareArgs = ({ owner, spender }) => [`${owner}`, `${spender}`];

const postProcess = async (
  result,
  prepared,
  environment,
): Promise<QuantityInterface> => {
  const token = await getToken(prepared.contractAddress, environment);
  const quantity = createQuantity(token, `${result}`);
  return quantity;
};

export const allowance = callFactory('allowance', Contracts.PreminedToken, {
  postProcess,
  prepareArgs,
});
