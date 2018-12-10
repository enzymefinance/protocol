import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployFundRanking = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    'factory/FundRanking.sol',
    [],
  );

  return address;
};
