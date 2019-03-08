import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';

export const deployParticipationFactory = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    Contracts.ParticipationFactory,
  );

  return address;
};
