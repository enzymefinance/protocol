import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployToken = async (
  symbol: string = 'FIXED',
  decimals: number = 18,
  name: string = 'Premined Token',
  environment?: Environment,
) => {
  const address = await deployContract(
    'dependencies/token/PreminedToken.sol',
    [symbol, decimals, name],
    environment,
  );

  return address;
};
