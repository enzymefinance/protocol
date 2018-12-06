import { Address } from '@melonproject/token-math/address';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getFundDetails = async (
  contractAddress: Address,
  versionAddress: Address,
  environment = getGlobalEnvironment(),
) => {
  const contract = getContract(
    Contracts.FundRanking,
    contractAddress,
    environment,
  );

  const fundDetails = await contract.methods
    .getFundDetails(versionAddress.toString())
    .call();

  const {
    0: addresses,
    1: sharePrices,
    2: creationTimes,
    3: names,
  } = fundDetails;

  const result = addresses.map((address, index) => ({
    address,
    rank: index,
    name: names[index],
    sharePrice: sharePrices[index],
    creationTime: creationTimes[index],
  }));

  console.log(result);

  return result;
};
