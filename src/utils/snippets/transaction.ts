import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';

// import getContract from '../utils/getContract';
// import ensure from '~/utils/guards/ensure';

export const guards = async (contractAddress: string, params, environment) => {
  // TODO
};

export const prepare = async (contractAddress: string, params) => {
  // const contract = getContract(contractAddress);
  // const transaction = contract.methods.TODO(params[0], params[1]);
  // return transaction;
};

export const send = async (transaction, environment) => {
  const receipt = await transaction.send({
    from: environment.wallet.address,
  });

  return receipt;
};

export const validateReceipt = (receipt, params) => {
  return true;
};

const TODO = async (contractAddress: string, params, environment) => {
  await guards(contractAddress, params, environment);
  const transaction = await prepare(contractAddress, params);
  const receipt = await send(transaction, environment);
  const result = validateReceipt(receipt, params);
  return result;
};

export default TODO;
