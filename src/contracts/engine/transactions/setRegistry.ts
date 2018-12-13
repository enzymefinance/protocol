import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';

interface SetRegistryArgs {
  address: Address;
}

type SetRegistryResult = boolean;

export const setRegistry: EnhancedExecute<
  SetRegistryArgs,
  SetRegistryResult
> = transactionFactory('setRegistry', Contracts.Engine);
