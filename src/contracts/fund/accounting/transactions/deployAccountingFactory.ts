import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployAccountingFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/accounting/AccountingFactory.sol',
    null,
    environment,
  );

  return address;
};
