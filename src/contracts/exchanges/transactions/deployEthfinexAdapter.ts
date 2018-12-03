import { deploy } from '~/utils/solidity/deploy';
import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';

export const deployEthfinexAdapter = async (environment?: Environment) => {
  const address = await deploy(Contracts.EthfinexAdapter, [], environment);

  return address;
};
