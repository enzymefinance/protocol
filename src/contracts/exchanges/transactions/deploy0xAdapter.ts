import { deploy } from '~/utils/solidity/deploy';
import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';

export const deploy0xAdapter = async (environment?: Environment) => {
  const address = await deploy(Contracts.ZeroExAdapter, null, environment);

  return address;
};
