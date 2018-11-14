import { transactionFactory } from '~/utils/solidity';
import { Address } from '~/utils/types';
import { Contracts } from '~/Contracts';

export interface CreateInstanceArgs {
  hubAddress: Address;
}

export type CreateInstanceResult = Address;

export const prepareArgs = async ({ hubAddress }: CreateInstanceArgs) => [
  `${hubAddress}`,
];

export const postProcess = async (
  receipt: any,
): Promise<CreateInstanceResult> => {
  const vaultAddress = receipt.events.InstanceCreated.returnValues.child;
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
