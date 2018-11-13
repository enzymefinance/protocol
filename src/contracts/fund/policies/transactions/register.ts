import { Address } from '~/utils/types';
import { getFunctionSignature } from '~/utils/abi';
import {
  prepareTransaction,
  sendTransaction,
  getContract,
} from '~/utils/solidity';
import { Contracts, requireMap } from '~/Contracts';

const genericExchangeInterfaceABI = requireMap[Contracts.GenericExchange];
const participationABI = requireMap[Contracts.Participation];

export enum PolicedMethods {
  makeOrder = getFunctionSignature(genericExchangeInterfaceABI, 'makeOrder'),
  takeOrder = getFunctionSignature(genericExchangeInterfaceABI, 'takeOrder'),
  // tslint:disable-next-line:max-line-length
  executeRequest = getFunctionSignature(participationABI, 'executeRequestFor'),
  // TODO: Add more here
}

interface RegisterArgs {
  method: PolicedMethods;
  policy: Address;
}

export const guards = async (contractAddress: Address, environment) => {
  // TODO
};

export const prepare = async (
  contractAddress: Address,
  { method, policy },
  environment,
) => {
  const contract = getContract(Contracts.PolicyManager, contractAddress);
  const transaction = contract.methods.register(method, policy.toString());
  transaction.name = 'register';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

export const validateReceipt = receipt => {
  return true;
};

export const register = async (
  contractAddress: Address,
  { method, policy }: RegisterArgs,
  environment?,
) => {
  await guards(contractAddress, environment);
  const transaction = await prepare(
    contractAddress,
    { method, policy },
    environment,
  );
  const receipt = await sendTransaction(transaction, environment);
  const result = validateReceipt(receipt);
  return result;
};
