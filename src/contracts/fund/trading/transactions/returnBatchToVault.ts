import { Address } from '@melonproject/token-math';

import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { ensureFundOwner } from '../../trading/guards/ensureFundOwner';

export interface ReturnBatchToVaultArgs {
  assets: Address[];
}

const guard = async (environment, params, contractAddress) => {
  ensureFundOwner(environment, contractAddress);
};

const prepareArgs: PrepareArgsFunction<ReturnBatchToVaultArgs> = async (
  _,
  { assets },
) => {
  return [assets];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  return receipt;
};

const returnBatchToVault = transactionFactory(
  'returnBatchToVault',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
);

export { returnBatchToVault };
