import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployParticipationFactory = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    'fund/participation/ParticipationFactory.sol',
    null,
  );

  return address;
};
