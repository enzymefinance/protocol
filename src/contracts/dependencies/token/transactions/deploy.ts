import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';

import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deployToken = async (
  symbol: string = 'FIXED',
  decimals: number = 18,
  name: string = 'Premined Token',
  environment = getGlobalEnvironment(),
) => {
  const address = await deployContract(
    Contracts.PreminedToken,
    [symbol, decimals, name],
    environment,
  );

  return address;
};
