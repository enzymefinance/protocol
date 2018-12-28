import { deployContract } from '~/utils/solidity/deployContract';
import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';

export const deployEthfinexAdapter = async (environment: Environment) => {
  const address = await deployContract(environment, Contracts.EthfinexAdapter);

  return address;
};
