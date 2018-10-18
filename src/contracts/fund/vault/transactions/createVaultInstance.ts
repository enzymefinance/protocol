import { prepareTransaction } from '~/utils/solidity/prepareTransaction';
import { sendTransaction } from '~/utils/solidity/sendTransaction';
import { Address } from '~/utils/types';
import { ensure } from '~/utils/guards/ensure';
import { sha3 } from 'web3-utils';

import { getFactoryContract } from '../utils/getFactoryContract';

interface CreateInstanceArgs {
  hubAddress: Address;
}

export const guards = async (
  contractAddress: string,
  params: CreateInstanceArgs,
  environment,
) => {};

export const prepare = async (
  contractAddress: string,
  { hubAddress }: CreateInstanceArgs,
  environment,
) => {
  const contract = getFactoryContract(contractAddress);
  const transaction = contract.methods.createInstance(hubAddress);
  transaction.name = 'createInstance';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

export const validateReceipt = async (receipt: any) => {
  const vaultAddress = receipt.events.InstanceCreated.returnValues.child;
  return vaultAddress;
};

export const createVaultInstance = async (
  contractAddress: string,
  params: CreateInstanceArgs,
  environment?,
) => {
  await guards(contractAddress, params, environment);
  const transaction = await prepare(contractAddress, params, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = await validateReceipt(receipt);
  return result;
};
