import { deploySystem } from './deploy/deploySystem';
import { deployThirdparty } from './deploy/deployThirdparty';
import { Contracts } from '~/Contracts';
import { getContract } from '~/utils/solidity/getContract';
import { Environment } from './environment/Environment';

export const deployAndGetSystem = async (environment: Environment) => {
  const thirdParty = await deployThirdparty(environment);
  const addresses = (await deploySystem(environment, thirdParty)).deployment;
  const contracts = {
    engine: getContract(
      environment,
      Contracts.Engine,
      addresses.melonContracts.engine,
    ),
    eur: getContract(
      environment,
      Contracts.StandardToken,
      addresses.thirdpartyContracts.tokens.find(t => t.symbol === 'EUR')
        .address,
    ),
    kyberAdapter: getContract(
      environment,
      Contracts.KyberAdapter,
      addresses.exchangeConfigs['KyberNetwork'].adapter,
    ),
    kyberNetwork: getContract(
      environment,
      Contracts.KyberNetwork,
      addresses.exchangeConfigs['KyberNetwork'].exchange,
    ),
    matchingMarket: getContract(
      environment,
      Contracts.MatchingMarket,
      addresses.exchangeConfigs['MatchingMarket'].exchange,
    ),
    matchingMarketAdapter: getContract(
      environment,
      Contracts.MatchingMarketAdapter,
      addresses.exchangeConfigs['MatchingMarket'].adapter,
    ),
    mln: getContract(
      environment,
      Contracts.StandardToken,
      addresses.thirdpartyContracts.tokens.find(t => t.symbol === 'MLN')
        .address,
    ),
    priceSource: getContract(
      environment,
      Contracts.TestingPriceFeed,
      addresses.melonContracts.priceSource,
    ),
    version: getContract(
      environment,
      Contracts.Version,
      addresses.melonContracts.version,
    ),
    weth: getContract(
      environment,
      Contracts.StandardToken,
      addresses.thirdpartyContracts.tokens.find(t => t.symbol === 'WETH')
        .address,
    ),
    zeroExAdapter: getContract(
      environment,
      Contracts.ZeroExAdapter,
      addresses.exchangeConfigs['ZeroEx'].adapter,
    ),
    zeroExExchange: getContract(
      environment,
      Contracts.ZeroExExchange,
      addresses.exchangeConfigs['ZeroEx'].exchange,
    ),
    zrx: getContract(
      environment,
      Contracts.StandardToken,
      addresses.thirdpartyContracts.tokens.find(t => t.symbol === 'ZRX')
        .address,
    ),
  };

  return { addresses, contracts };
};
