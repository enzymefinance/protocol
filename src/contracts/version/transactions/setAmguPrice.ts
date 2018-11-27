import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { getAmguPrice } from '../calls/getAmguPrice';

type SetAmguPrice = QuantityInterface;

const guards = async () => {};

const prepareArgs = async params => {
  return [`${params.quantity}`];
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  const amguPrice = await getAmguPrice(contractAddress, environment);
  return amguPrice;
};

const setAmguPrice: EnhancedExecute<
  SetAmguPrice,
  SetAmguPrice
> = transactionFactory(
  'setAmguPrice',
  Contracts.MockVersion,
  guards,
  prepareArgs,
  postProcess,
);

export { setAmguPrice };
