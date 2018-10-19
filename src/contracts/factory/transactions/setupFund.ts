import {
  prepareTransaction,
  sendTransaction,
  Contract,
  getContract,
} from '~/utils/solidity';
import { getGlobalEnvironment } from '~/utils/environment';

const guards = async (contractAddress: string, environment) => {
  // TODO
};

const prepare = async (contractAddress: string, environment) => {
  const contract = getContract(
    Contract.FundFactory,
    contractAddress,
    environment,
  );
  const transaction = contract.methods.setupFund();
  transaction.name = 'setupFund';
  const prepared = await prepareTransaction(transaction, environment);
  return prepared;
};

const postProcess = async (
  receipt,
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const contract = getContract(
    Contract.FundFactory,
    contractAddress,
    environment,
  );
  const hubAddress = await contract.methods
    .managersToHubs(environment.wallet.address)
    .call();
  return hubAddress;
};

export const setupFund = async (contractAddress: string, environment?) => {
  await guards(contractAddress, environment);
  const transaction = await prepare(contractAddress, environment);
  const receipt = await sendTransaction(transaction, environment);
  const result = postProcess(receipt, contractAddress, environment);
  return result;
};
