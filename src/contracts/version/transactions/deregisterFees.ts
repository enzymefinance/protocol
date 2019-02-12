import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface DeregisterFeesArgs {
  addresses: Address[];
}

type DeregisterFeesResult = boolean;

export const deregisterFees: EnhancedExecute<
  DeregisterFeesArgs,
  DeregisterFeesResult
> = transactionFactory('deregisterFees', Contracts.Registry);
