import { Address } from '@melonproject/token-math/address';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { createQuantity } from '@melonproject/token-math/quantity';
import { createPrice } from '@melonproject/token-math/price';

import { getTokenByAddress } from '~/utils/environment/getTokenByAddress';

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
    4: denominationAsset,
  } = fundDetails;

  const result = addresses.map((address, index) => {
    const denominationToken = getTokenByAddress(
      environment,
      denominationAsset[index],
    );

    const fundToken = {
      decimals: 18,
      symbol: 'MLNF',
    };

    return {
      address,
      creationTime: new Date(creationTimes[index] * 1000),
      name: names[index],
      rank: index + 1,
      sharePrice: createPrice(
        createQuantity(fundToken, 1),
        createQuantity(denominationToken, sharePrices[index]),
      ),
    };
  });

  return result;
};
