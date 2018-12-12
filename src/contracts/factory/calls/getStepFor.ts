import { Address } from '@melonproject/token-math/address';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getStepFor = async (environment, managerAddress: Address) => {
  const contract = getContract(
    environment,
    Contracts.FundFactory,
    environment.deployment.version,
  );

  return contract.methods.stepFor(managerAddress.toString()).call();
};
