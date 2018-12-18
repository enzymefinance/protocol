import { Address } from '@melonproject/token-math/address';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { PriceInterface } from '@melonproject/token-math/price';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { getPrice } from '@melonproject/token-math/price';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getQuoteToken } from '~/contracts/fund/accounting/calls/getQuoteToken';

interface GetFundDetailsResult {
  address: Address;
  rank: Number;
  name: String;
  createTime: Date;
  sharePrice: PriceInterface;
}

export const getFundDetails = async (
  environment,
  contractAddress: Address,
  versionAddress: Address,
): Promise<GetFundDetailsResult> => {
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

  const result = addresses.map(async (address, index) => {
    const settings = await getSettings(environment, address);
    const quoteToken = await getQuoteToken(
      environment,
      settings.accountingAddress,
    );
    const fundToken = await getToken(environment, settings.sharesAddress);

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
