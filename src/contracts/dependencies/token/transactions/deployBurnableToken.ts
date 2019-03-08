import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const deployBurnableToken = async (
  environment: Environment,
  symbol: string = 'FIXED',
  decimals: number = 18,
  name: string = 'Premined Token',
) => {
  const address = await deployContract(environment, Contracts.BurnableToken, [
    symbol,
    decimals,
    name,
  ]);

  return address;
};
