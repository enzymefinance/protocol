import { deploySystem } from './deploySystem';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { Contracts } from '~/Contracts';
import { getContract } from '~/utils/solidity/getContract';

export const deployAndGetSystem = async (
  environment = getGlobalEnvironment(),
) => {
  const addresses = await deploySystem();
  const contracts = {
    engine: getContract(Contracts.Engine, addresses.engine),
    eur: getContract(
      Contracts.StandardToken,
      addresses.tokens.find(t => t.symbol === 'EUR').address,
    ),
    kyberAdapter: getContract(
      Contracts.KyberAdapter,
      addresses.exchangeConfigs.find(t => t.name === 'KyberNetwork')
        .adapterAddress,
    ),
    kyberNetwork: getContract(
      Contracts.KyberNetwork,
      addresses.exchangeConfigs.find(t => t.name === 'KyberNetwork')
        .exchangeAddress,
    ),
    matchingMarket: getContract(
      Contracts.MatchingMarket,
      addresses.exchangeConfigs.find(t => t.name === 'MatchingMarket')
        .exchangeAddress,
    ),
    matchingMarketAdapter: getContract(
      Contracts.MatchingMarketAdapter,
      addresses.exchangeConfigs.find(t => t.name === 'MatchingMarket')
        .adapterAddress,
    ),
    mln: getContract(
      Contracts.StandardToken,
      addresses.tokens.find(t => t.symbol === 'MLN').address,
    ),
    priceSource: getContract(Contracts.TestingPriceFeed, addresses.priceSource),
    version: getContract(Contracts.Version, addresses.version),
    weth: getContract(
      Contracts.StandardToken,
      addresses.tokens.find(t => t.symbol === 'WETH').address,
    ),
    zeroExAdapter: getContract(
      Contracts.ZeroExAdapter,
      addresses.exchangeConfigs.find(t => t.name === 'ZeroEx').adapterAddress,
    ),
    zeroExExchange: getContract(
      Contracts.ZeroExExchange,
      addresses.exchangeConfigs.find(t => t.name === 'ZeroEx').exchangeAddress,
    ),
    zrx: getContract(
      Contracts.StandardToken,
      addresses.tokens.find(t => t.symbol === 'ZRX').address,
    ),
  };

  return { addresses, contracts };
};
