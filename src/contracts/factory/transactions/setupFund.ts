import { Contract, transactionFactory, getContract } from '~/utils/solidity';

const postProcess = async (receipt, params, contractAddress, environment?) => {
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

export const setupFund = transactionFactory(
  'setupFund',
  Contract.FundFactory,
  undefined,
  undefined,
  postProcess,
);
