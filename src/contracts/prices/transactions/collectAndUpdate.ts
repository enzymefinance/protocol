import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';

export interface CollectAndUpdateArgs {
  ofAssets: Address[];
}

const prepareArgs: PrepareArgsFunction<CollectAndUpdateArgs> = async (
  _,
  { ofAssets },
) => [ofAssets.map(ofAsset => ofAsset.toString())];

const postProcess = (_, receipt) => receipt;

const collectAndUpdate = transactionFactory(
  'collectAndUpdate',
  Contracts.CanonicalPriceFeed,
  undefined,
  prepareArgs,
  postProcess,
);

export default collectAndUpdate;
