import { Address } from '~/utils/types';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { isAddress } from '~/utils/checks/isAddress';
import { isEmptyAddress } from '~/utils/checks/isEmptyAddress';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const managersToHubs = async (
  contractAddress: Address,
  managerAddress: Address,
  environment = getGlobalEnvironment(),
) => {
  const contract = getContract(
    Contracts.FundFactory,
    contractAddress,
    environment,
  );
  const hubAddress = await contract.methods
    .managersToHubs(managerAddress.toString())
    .call();
  if (!isAddress(hubAddress) || isEmptyAddress(hubAddress)) {
    return null;
  }
  return hubAddress;
};
