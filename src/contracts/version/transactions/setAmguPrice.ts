import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { getAmguPrice } from '../calls/getAmguPrice';

type SetAmguPrice = QuantityInterface;

const guards = async () => {};

const prepareArgs = async (_, params) => {
  return [`${params.quantity}`];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  const amguPrice = await getAmguPrice(environment, contractAddress);
  return amguPrice;
};

const setAmguPrice: EnhancedExecute<
  SetAmguPrice,
  SetAmguPrice
> = transactionFactory(
  'setAmguPrice',
  Contracts.Version,
  guards,
  prepareArgs,
  postProcess,
);

export { setAmguPrice };
