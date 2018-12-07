import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deployAccountingFactory = async (environment?: Environment) => {
  const address = await deployContract(
    Contracts.AccountingFactory,
    null,
    environment,
  );

  return address;
};
