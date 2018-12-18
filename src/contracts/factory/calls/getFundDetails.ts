import { Address } from '@melonproject/token-math/address';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getFundDetails = async (
  environment,
  contractAddress: Address,
  versionAddress: Address,
) => {
  const contract = getContract(
    environment,
    Contracts.FundRanking,
    contractAddress,
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
    rank: index + 1,
    name: names[index],
    sharePrice: sharePrices[index],
    creationTime: new Date(creationTimes[index] * 1000),
  }));

  return result;
};
