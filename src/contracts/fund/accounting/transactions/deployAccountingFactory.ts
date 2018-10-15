import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

const deployAccountingFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/accounting/AccountingFactory.sol',
    null,
    environment,
  );

  return address;
};

export default deployAccountingFactory;
