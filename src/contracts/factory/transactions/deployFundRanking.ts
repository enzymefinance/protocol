import { Environment } from '~/utils/environment/Environment';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployFundRanking = async (
  environment: Environment = getGlobalEnvironment(),
) => {
  const address = await deployContract(
    'factory/FundRanking.sol',
    [],
    environment,
  );

  return address;
};
