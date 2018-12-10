import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deploySharesFactory = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    'fund/shares/SharesFactory.sol',
    null,
  );

  return address;
};
