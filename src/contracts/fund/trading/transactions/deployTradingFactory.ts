import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deployTradingFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/trading/TradingFactory.sol',
    null,
    environment,
  );

  return address;
};
