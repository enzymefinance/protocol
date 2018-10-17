import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deployParticipationFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/participation/ParticipationFactory.sol',
    null,
    environment,
  );

  return address;
};
