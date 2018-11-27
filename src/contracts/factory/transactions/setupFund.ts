import { getContract } from '~/utils/solidity/getContract';
import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const postProcess = async (receipt, params, contractAddress, environment?) => {
  const contract = getContract(
    Contracts.FundFactory,
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
  Contracts.FundFactory,
  undefined,
  undefined,
  postProcess,
  { amguPayable: true },
);
