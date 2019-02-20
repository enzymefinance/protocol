import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface SetMGMArgs {
  address: Address;
}

type SetMGMResult = boolean;

export const setMGM: EnhancedExecute<
  SetMGMArgs,
  SetMGMResult
> = transactionFactory('setMGM', Contracts.Registry);
