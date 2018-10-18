import { prepareTransaction, sendTransaction } from '~/utils/solidity';

// import { ensure } from '~/utils/guards';

export const guards = async (contractAddress: string, environment) => {
  // TODO
};

export const prepare = async (contractAddress: string, environment) => {
  const contract = getContract(contractAddress);
  const transaction = contract.methods.approve();
  transaction.name = 'approve';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

export const validateReceipt = receipt => {
  return true;
};

// tslint:disable-next-line:variable-name
export const approve = async (contractAddress: string, environment?) => {
  await guards(contractAddress, environment);
  const transaction = await prepare(contractAddress, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};
