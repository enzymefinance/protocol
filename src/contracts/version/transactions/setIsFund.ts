import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';

interface SetIsFundFactoryArgs {
  address: Address;
}

type SetIsFundFactoryResult = boolean;

export const setIsFund: EnhancedExecute<
  SetIsFundFactoryArgs,
  SetIsFundFactoryResult
> = transactionFactory('setIsFund', Contracts.Version);
