import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

const deployTradingFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/trading/TradingFactory.sol',
    null,
    environment,
  );

  return address;
};

export default deployTradingFactory;
