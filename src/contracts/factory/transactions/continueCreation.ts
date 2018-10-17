import { prepareTransaction, sendTransaction } from '~/utils/solidity';

import { getContract } from '..';
// import ensure from '~/utils/guards';

export const guards = async (contractAddress: string, environment) => {};

const prepare = async (contractAddress: string, environment) => {
  const contract = getContract(contractAddress);
  const transaction = contract.methods.continueCreation();
  transaction.name = 'continueCreation';

  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

const validateReceipt = receipt => {
  return true;
};

export const continueCreation = async (
  contractAddress: string,
  environment?,
) => {
  await guards(contractAddress, environment);
  const transaction = await prepare(contractAddress, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};
