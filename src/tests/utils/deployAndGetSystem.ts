import * as R from 'ramda';

import {
  deploySystem,
  deployAllContractsConfig,
} from '../../utils/deploy/deploySystem';
import { deployThirdParty } from '../../utils/deploy/deployThirdParty';
import { Contracts } from '~/Contracts';
import { getContract } from '~/utils/solidity/getContract';
import { Environment } from '../../utils/environment/Environment';
import { deployTestingPriceFeed } from '~/contracts/prices/transactions/deployTestingPriceFeed';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';

export const deployAndGetSystem = async (environment: Environment) => {
  const thirdParty = await deployThirdParty(environment);
  const envWithDeployment = await deploySystem(
    environment,
    thirdParty,
    deployAllContractsConfig,
  );

  // Override the price source (system one is Kyber)
  const feedAddress = await deployTestingPriceFeed(
    environment,
    getTokenBySymbol(envWithDeployment, 'WETH'),
  );

  const addresses = R.assocPath(
    ['melonContracts', 'priceSource'],
    feedAddress,
    envWithDeployment.deployment,
  );

  const contracts = {
    dgx: getContract(
      environment,
      Contracts.StandardToken,
      addresses.thirdPartyContracts.tokens.find(t => t.symbol === 'DGX')
        .address,
    ),
    engine: getContract(
      environment,
      Contracts.Engine,
      addresses.melonContracts.engine,
    ),
    eur: getContract(
      environment,
      Contracts.StandardToken,
      addresses.thirdPartyContracts.tokens.find(t => t.symbol === 'EUR')
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
      addresses.thirdPartyContracts.tokens.find(t => t.symbol === 'MLN')
        .address,
    ),
    priceSource: getContract(
      environment,
      Contracts.TestingPriceFeed,
      addresses.melonContracts.priceSource,
    ),
    registry: getContract(
      environment,
      Contracts.Registry,
      addresses.melonContracts.registry,
    ),
    version: getContract(
      environment,
      Contracts.Version,
      addresses.melonContracts.version,
    ),
    weth: getContract(
      environment,
      Contracts.StandardToken,
      addresses.thirdPartyContracts.tokens.find(t => t.symbol === 'WETH')
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
      addresses.thirdPartyContracts.tokens.find(t => t.symbol === 'ZRX')
        .address,
    ),
  };

  return { addresses, contracts };
};
