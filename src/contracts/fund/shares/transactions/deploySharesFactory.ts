import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deploySharesFactory = async (environment?: Environment) => {
  const address = await deployContract(
    Contracts.SharesFactory,
    null,
    environment,
  );

  return address;
};
