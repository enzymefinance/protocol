import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const deployToken = async (
  environment: Environment,
  symbol: string = 'FIXED',
  decimals: number = 18,
  name: string = 'Premined Token',
) => {
  const address = await deployContract(environment, Contracts.PreminedToken, [
    symbol,
    decimals,
    name,
  ]);

  return address;
};

export const deployWeth = async (environment: Environment) => {
  const address = await deployContract(environment, Contracts.Weth);
  return address;
};
