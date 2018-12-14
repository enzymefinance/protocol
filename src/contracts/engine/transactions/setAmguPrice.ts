import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { getAmguPrice } from '../calls/getAmguPrice';

type SetAmguPriceArgs = QuantityInterface;
type SetAmguPriceResult = QuantityInterface;

const prepareArgs = async (environment, params, contractAddress) => {
  return [`${params.quantity}`];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  const amguPrice = await getAmguPrice(environment, contractAddress);
  return amguPrice;
};

const setAmguPrice: EnhancedExecute<
  SetAmguPriceArgs,
  SetAmguPriceResult
> = transactionFactory(
  'setAmguPrice',
  Contracts.Engine,
  undefined,
  prepareArgs,
  postProcess,
);

export { setAmguPrice };
