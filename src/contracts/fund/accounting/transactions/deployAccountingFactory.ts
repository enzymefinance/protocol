import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deployAccountingFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/accounting/AccountingFactory.sol',
    null,
    environment,
  );

  return address;
};
