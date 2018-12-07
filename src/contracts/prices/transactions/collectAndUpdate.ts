import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';

export interface collectAndUpdateArgs {
  ofAssets: Address[];
}

const prepareArgs: PrepareArgsFunction<collectAndUpdateArgs> = async ({
  ofAssets,
}) => [ofAssets.map(ofAsset => ofAsset.toString())];

const postProcess = async receipt => receipt;

const collectAndUpdate = transactionFactory(
  'collectAndUpdate',
  Contracts.CanonicalPriceFeed,
  undefined,
  prepareArgs,
  postProcess,
);

export default collectAndUpdate;
