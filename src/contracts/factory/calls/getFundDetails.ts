import { Address } from '@melonproject/token-math/address';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getPrice } from '@melonproject/token-math/price';

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
    4: quoteAsset,
  } = fundDetails;

  const result = addresses.map((address, index) => {
    const quoteToken = environment.deployment.thirdPartyContracts.tokens.find(
      token => token.address === quoteAsset[index],
    );

    const fundToken = {
      decimals: 18,
      symbol: 'MLNF',
    };

    return {
      address,
      rank: index + 1,
      name: names[index],
      sharePrice: getPrice(
        createQuantity(fundToken, 1),
        createQuantity(quoteToken, sharePrices[index]),
      ),
      creationTime: new Date(creationTimes[index] * 1000),
    };
  });

  return result;
};
