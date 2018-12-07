import { Address } from '@melonproject/token-math/address';
import { isAddress } from '~/utils/checks/isAddress';
import { isEmptyAddress } from '~/utils/checks/isEmptyAddress';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const managersToHubs = async (
  environment: Environment,
  contractAddress: Address,
  managerAddress: Address,
) => {
  const contract = getContract(
    environment,
    Contracts.FundFactory,
    contractAddress,
  );

  const hubAddress = await contract.methods
    .managersToHubs(managerAddress.toString())
    .call();

  if (!isAddress(hubAddress) || isEmptyAddress(hubAddress)) {
    return null;
  }

  return hubAddress;
};
