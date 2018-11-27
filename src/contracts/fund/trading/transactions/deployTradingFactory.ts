import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployTradingFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/trading/TradingFactory.sol',
    null,
    environment,
  );

  return address;
};
