import { deploySystem } from './deploySystem';
import { Contracts } from '~/Contracts';
import { getContract } from '~/utils/solidity/getContract';
import { Environment } from './environment/Environment';

export const deployAndGetSystem = async (environment: Environment) => {
  const addresses = (await deploySystem(environment)).deployment;
  const contracts = {
    engine: getContract(environment, Contracts.Engine, addresses.engine),
    eur: getContract(
      environment,
      Contracts.StandardToken,
      addresses.tokens.find(t => t.symbol === 'EUR').address,
    ),
    kyberAdapter: getContract(
      environment,
      Contracts.KyberAdapter,
      addresses.exchangeConfigs.find(t => t.name === 'KyberNetwork')
        .adapterAddress,
    ),
    kyberNetwork: getContract(
      environment,
      Contracts.KyberNetwork,
      addresses.exchangeConfigs.find(t => t.name === 'KyberNetwork')
        .exchangeAddress,
    ),
    matchingMarket: getContract(
      environment,
      Contracts.MatchingMarket,
      addresses.exchangeConfigs.find(t => t.name === 'MatchingMarket')
        .exchangeAddress,
    ),
    matchingMarketAdapter: getContract(
      environment,
      Contracts.MatchingMarketAdapter,
      addresses.exchangeConfigs.find(t => t.name === 'MatchingMarket')
        .adapterAddress,
    ),
    mln: getContract(
      environment,
      Contracts.StandardToken,
      addresses.tokens.find(t => t.symbol === 'MLN').address,
    ),
    priceSource: getContract(
      environment,
      Contracts.TestingPriceFeed,
      addresses.priceSource,
    ),
    version: getContract(environment, Contracts.Version, addresses.version),
    weth: getContract(
      environment,
      Contracts.StandardToken,
      addresses.tokens.find(t => t.symbol === 'WETH').address,
    ),
    zeroExAdapter: getContract(
      environment,
      Contracts.ZeroExAdapter,
      addresses.exchangeConfigs.find(t => t.name === 'ZeroEx').adapterAddress,
    ),
    zeroExExchange: getContract(
      environment,
      Contracts.ZeroExExchange,
      addresses.exchangeConfigs.find(t => t.name === 'ZeroEx').exchangeAddress,
    ),
    zrx: getContract(
      environment,
      Contracts.StandardToken,
      addresses.tokens.find(t => t.symbol === 'ZRX').address,
    ),
  };

  return { addresses, contracts };
};
