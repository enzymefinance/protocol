import { Environment } from '~/utils/environment/Environment';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deployFundRanking = async (
  environment: Environment = getGlobalEnvironment(),
) => {
  const address = await deployContract(Contracts.FundRanking, [], environment);

  return address;
};
