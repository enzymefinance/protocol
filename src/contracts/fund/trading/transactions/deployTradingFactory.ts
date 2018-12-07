import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deployTradingFactory = async (environment?: Environment) => {
  const address = await deployContract(
    Contracts.TradingFactory,
    null,
    environment,
  );

  return address;
};
