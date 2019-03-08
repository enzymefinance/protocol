import { Address } from '@melonproject/token-math';

import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

export interface CreateInstanceArgs {
  hubAddress: Address;
}

export type CreateInstanceResult = Address;

export const prepareArgs = async (_, { hubAddress }: CreateInstanceArgs) => [
  `${hubAddress}`,
];

export const postProcess = async (
  _,
  receipt: any,
): Promise<CreateInstanceResult> => {
  const vaultAddress = receipt.events.NewInstance.returnValues.instance;
  return vaultAddress;
};

export const createVaultInstance = transactionFactory<
  CreateInstanceArgs,
  CreateInstanceResult
>(
  'createInstance',
  Contracts.VaultFactory,
  undefined,
  prepareArgs,
  postProcess,
);
