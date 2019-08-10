import {
  deploySystem,
  deployAllContractsConfig,
  defaultControlConfig,
} from '../../utils/deploy/deploySystem';
import { deployThirdParty } from '../../utils/deploy/deployThirdParty';
import { Contracts } from '~/Contracts';
import { getContract } from '~/utils/solidity/getContract';
import { Environment } from '../../utils/environment/Environment';

export const deployAndGetSystem = async (environment: Environment) => {
  const thirdParty = await deployThirdParty(environment);
  const envWithDeployment = await deploySystem(
    environment,
    thirdParty,
    deployAllContractsConfig,
    defaultControlConfig,
  );

  const addresses = envWithDeployment.deployment;

  const contracts = {
    dai: getContract(
      environment,
      Contracts.StandardToken,
      addresses.thirdPartyContracts.tokens.find(t => t.symbol === 'DAI')
        .address,
    ),
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
    ethfinex: getContract(
      environment,
      Contracts.ZeroExExchange,
      addresses.exchangeConfigs['Ethfinex'].exchange,
    ),
    ethfinexAdapter: getContract(
      environment,
      Contracts.EthfinexAdapter,
      addresses.exchangeConfigs['Ethfinex'].adapter,
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
    priceTolerance: getContract(
      environment,
      Contracts.PriceTolerance,
      addresses.melonContracts.policies.priceTolerance,
    ),
    registry: getContract(
      environment,
      Contracts.Registry,
      addresses.melonContracts.registry,
    ),
    uniswapAdapter: getContract(
      environment,
      Contracts.UniswapAdapter,
      addresses.exchangeConfigs['UniswapFactory'].adapter,
    ),
    uniswapFactory: getContract(
      environment,
      Contracts.UniswapFactory,
      addresses.exchangeConfigs['UniswapFactory'].exchange,
    ),
    userWhitelist: getContract(
      environment,
      Contracts.UserWhitelist,
      addresses.melonContracts.policies.userWhitelist,
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
