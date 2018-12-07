import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployAccountingFactory = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    'fund/accounting/AccountingFactory.sol',
    null,
  );

  return address;
};
