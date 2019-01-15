import {
  transactionFactory,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface SetNativeAssetArgs {
  address: Address;
}

type SetNativeAssetResult = boolean;

export const setNativeAsset: EnhancedExecute<
  SetNativeAssetArgs,
  SetNativeAssetResult
> = transactionFactory('setNativeAsset', Contracts.Registry);
