import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { QuantityInterface } from '@melonproject/token-math';

type SetIncentiveArgs = QuantityInterface;
type SetIncentiveResult = boolean;

const prepareArgs = async (environment, params, contractAddress) => {
  return [`${params.quantity}`];
};

export const setIncentive: EnhancedExecute<
  SetIncentiveArgs,
  SetIncentiveResult
> = transactionFactory(
  'setIncentive',
  Contracts.Registry,
  undefined,
  prepareArgs,
);
