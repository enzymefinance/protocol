import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';

interface SetMlnTokenArgs { address: Address; }

type SetMlnTokenResult = boolean;

export const setMlnToken: EnhancedExecute<
  SetMlnTokenArgs,
  SetMlnTokenResult
> = transactionFactory('setMlnToken', Contracts.Registry);

