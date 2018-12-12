import { Address } from '@melonproject/token-math/address';

import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { TokenInterface } from '@melonproject/token-math/token';

interface DeployEngineArgs {
  priceSource: Address;
  delay: number;
  mlnToken: TokenInterface;
}

export const deployEngine = async (
  environment: Environment,
  { priceSource, delay, mlnToken }: DeployEngineArgs,
) => {
  const address = await deployContract(environment, Contracts.Engine, [
    priceSource.toString(),
    delay,
    mlnToken.address.toString(),
  ]);

  return address;
};
