import { prepareTransaction } from '~/utils/solidity/prepareTransaction';
import { sendTransaction } from '~/utils/solidity/sendTransaction';
import {
  transactionFactory,
  getContract,
  EnhancedExecute,
} from '~/utils/solidity';
import { Address } from '~/utils/types';
import { ensure } from '~/utils/guards/ensure';
import { sha3 } from 'web3-utils';

import { Contracts } from '~/Contracts';

export interface CreateInstanceArgs {
  hubAddress: Address;
}

export type CreateInstanceResult = Address;

export const prepareArgs = async ({ hubAddress }: CreateInstanceArgs) => [
  `${hubAddress}`,
];

export const postProcess = (receipt: any): CreateInstanceResult => {
  const vaultAddress = receipt.events.InstanceCreated.returnValues.child;
  return vaultAddress;
};

export const createVaultInstance: EnhancedExecute<
  CreateInstanceArgs,
  CreateInstanceResult
> = (contractAddress: string, params: CreateInstanceArgs, environment?) =>
  transactionFactory(
    'createInstance',
    Contracts.VaultFactory,
    undefined,
    prepareArgs,
    postProcess,
  );
