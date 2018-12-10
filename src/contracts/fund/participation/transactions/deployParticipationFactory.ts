import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deployParticipationFactory = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    Contracts.ParticipationFactory,
  );

  return address;
};
