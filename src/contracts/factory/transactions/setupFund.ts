import prepareTransaction from '~/utils/solidity/prepareTransaction';
import sendTransaction from '~/utils/solidity/sendTransaction';

import getContract from '../utils/getContract';
import ensure from '~/utils/guards/ensure';

export const guards = async (contractAddress: string, environment) => {
  // TODO
};

export const prepare = async (contractAddress: string, environment) => {
  const contract = getContract(contractAddress);
  const transaction = contract.methods.setupFund();
  transaction.name = 'setupFund';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

export const validateReceipt = receipt => {
  return true;
};

const setupFund = async (contractAddress: string, environment?) => {
  await guards(contractAddress, environment);
  const transaction = await prepare(contractAddress, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};

export default setupFund;
