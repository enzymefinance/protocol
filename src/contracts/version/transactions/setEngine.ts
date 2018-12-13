import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';

interface SetEngineArgs { address: Address; }

type SetEngineResult = boolean;

export const setEngine: EnhancedExecute<
  SetEngineArgs,
  SetEngineResult
> = transactionFactory('setEngine', Contracts.Registry);


