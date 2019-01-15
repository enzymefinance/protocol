import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface SetEthfinexWrapperRegistryArgs {
  address: Address;
}

type SetEthfinexWrapperRegistryResult = boolean;

export const setEthfinexWrapperRegistry: EnhancedExecute<
  SetEthfinexWrapperRegistryArgs,
  SetEthfinexWrapperRegistryResult
> = transactionFactory('setEthfinexWrapperRegistry', Contracts.Registry);
