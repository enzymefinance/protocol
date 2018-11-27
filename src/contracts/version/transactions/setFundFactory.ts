import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';

interface SetFundFactoryArgs {
  address: Address;
}

type SetFundFactoryResult = boolean;

export const setFundFactory: EnhancedExecute<
  SetFundFactoryArgs,
  SetFundFactoryResult
> = transactionFactory('setFundFactory', Contracts.Version);
