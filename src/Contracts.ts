import * as R from 'ramda';
import web3EthAbi from 'web3-eth-abi';

export enum Contracts {
  Accounting = 'Accounting',
  AccountingFactory = 'AccountingFactory',
  AddressList = 'AddressList',
  AmguConsumer = 'AmguConsumer',
  AssetBlacklist = 'AssetBlacklist',
  AssetWhitelist = 'AssetWhitelist',
  BurnableToken = 'BurnableToken',
  CanonicalPriceFeed = 'CanonicalPriceFeed',
  ConversionRates = 'ConversionRates',
  Engine = 'Engine',
  EngineAdapter = 'EngineAdapter',
  EthfinexAdapter = 'EthfinexAdapter',
  ERC20Proxy = 'ERC20Proxy',
  ExchangeAdapter = 'ExchangeAdapter',
  FalsePolicy = 'FalsePolicy',
  FeeManager = 'FeeManager',
  FeeManagerFactory = 'FeeManagerFactory',
  FundFactory = 'FundFactory',
  FundRanking = 'FundRanking',
  Hub = 'Hub',
  KyberAdapter = 'KyberAdapter',
  KyberNetwork = 'KyberNetwork',
  KyberNetworkProxy = 'KyberNetworkProxy',
  KyberPriceFeed = 'KyberPriceFeed',
  KyberReserve = 'KyberReserve',
  KyberWhiteList = 'KyberWhiteList',
  MaliciousToken = 'MaliciousToken',
  ManagementFee = 'ManagementFee',
  MatchingMarket = 'MatchingMarket',
  MatchingMarketAdapter = 'MatchingMarketAdapter',
  MatchingMarketAccessor = 'MatchingMarketAccessor',
  MaxConcentration = 'MaxConcentration',
  MaxPositions = 'MaxPositions',
  MockAccounting = 'MockAccounting',
  MockAdapter = 'MockAdapter',
  MockFee = 'MockFee',
  MockFeeManager = 'MockFeeManager',
  MockHub = 'MockHub',
  MockRegistry = 'MockRegistry',
  MockShares = 'MockShares',
  MockVersion = 'MockVersion',
  Participation = 'Participation',
  ParticipationFactory = 'ParticipationFactory',
  PerformanceFee = 'PerformanceFee',
  PermissiveAuthority = 'PermissiveAuthority',
  Policy = 'Policy',
  PolicyManager = 'PolicyManager',
  PolicyManagerFactory = 'PolicyManagerFactory',
  PreminedToken = 'PreminedToken',
  PriceSourceInterface = 'PriceSourceInterface',
  PriceTolerance = 'PriceTolerance',
  Registry = 'Registry',
  SelfDestructing = 'SelfDestructing',
  Shares = 'Shares',
  SharesFactory = 'SharesFactory',
  Spoke = 'Spoke',
  StakingPriceFeed = 'StakingPriceFeed',
  StandardToken = 'StandardToken',
  TestingPriceFeed = 'TestingPriceFeed',
  Trading = 'Trading',
  TradingFactory = 'TradingFactory',
  TruePolicy = 'TruePolicy',
  UserWhitelist = 'UserWhitelist',
  Vault = 'Vault',
  VaultFactory = 'VaultFactory',
  Version = 'Version',
  Weth = 'WETH',
  WrapperLock = 'WrapperLock',
  WrapperLockEth = 'WrapperLockEth',
  WrapperRegistryEFX = 'WrapperRegistryEFX',
  ZeroExAdapter = 'ZeroExV2Adapter',
  ZeroExExchange = 'Exchange',
}

// HINT: Link the interfaces instead of the implementations wherever possible
// (to maintain extensibility)
// prettier-ignore
export const requireMap = {
  [Contracts.Accounting]:
    require('../out/Accounting.abi.json'),
  [Contracts.AccountingFactory]:
    require(`../out/${Contracts.AccountingFactory}.abi.json`),
  [Contracts.AddressList]:
    require('../out/AddressList.abi.json'),
  [Contracts.AmguConsumer]:
    require('../out/AmguConsumer.abi.json'),
  [Contracts.AssetBlacklist]:
    require('../out/AssetBlacklist.abi.json'),
  [Contracts.AssetWhitelist]:
    require('../out/AssetWhitelist.abi.json'),
  [Contracts.BurnableToken]:
    require(`../out/${Contracts.BurnableToken}.abi.json`),
  [Contracts.CanonicalPriceFeed]:
    require(`../out/${Contracts.CanonicalPriceFeed}.abi.json`),
  [Contracts.ERC20Proxy]:
    require(`../out/${Contracts.ERC20Proxy}.abi.json`),
  [Contracts.Engine]:
    require('../out/Engine.abi.json'),
  [Contracts.EngineAdapter]:
    require('../out/EngineAdapter.abi.json'),
  [Contracts.EthfinexAdapter]:
    require(`../out/${Contracts.EthfinexAdapter}.abi.json`),
  [Contracts.ExchangeAdapter]:
    require(`../out/${Contracts.ExchangeAdapter}.abi.json`),
  [Contracts.FalsePolicy]:
    require('../out/FalsePolicy.abi.json'),
  [Contracts.FeeManager]:
    require('../out/FeeManager.abi.json'),
  [Contracts.FeeManagerFactory]:
    require(`../out/${Contracts.FeeManagerFactory}.abi.json`),
  [Contracts.FundFactory]:
    require('../out/FundFactory.abi.json'),
  [Contracts.FundRanking]:
    require('../out/FundRanking.abi.json'),
  [Contracts.Hub]:
    require('../out/Hub.abi.json'),
  [Contracts.MockAdapter]:
    require('../out/MockAdapter.abi.json'),
  [Contracts.ManagementFee]:
    require('../out/ManagementFee.abi.json'),
  [Contracts.MatchingMarket]:
    require('../out/MatchingMarket.abi.json'),
  [Contracts.MatchingMarketAdapter]:
    require('../out/MatchingMarketAdapter.abi.json'),
  [Contracts.MatchingMarketAccessor]:
    require('../out/MatchingMarketAccessor.abi.json'),
  [Contracts.KyberNetwork]:
    require('../out/KyberNetwork.abi.json'),
  [Contracts.KyberPriceFeed]:
    require(`../out/${Contracts.KyberPriceFeed}.abi.json`),
  [Contracts.KyberReserve]:
    require('../out/KyberReserve.abi.json'),
  [Contracts.KyberNetworkProxy]:
    require('../out/KyberNetworkProxy.abi.json'),
  [Contracts.KyberAdapter]:
    require('../out/KyberAdapter.abi.json'),
  [Contracts.ConversionRates]:
    require('../out/ConversionRates.abi.json'),
  [Contracts.KyberWhiteList]:
    require('../out/KyberWhiteList.abi.json'),
  [Contracts.MaliciousToken]:
    require('../out/MaliciousToken.abi.json'),
  [Contracts.MaxPositions]:
    require('../out/MaxPositions.abi.json'),
  [Contracts.MaxConcentration]:
    require('../out/MaxConcentration.abi.json'),
  [Contracts.MockAccounting]:
    require('../out/MockAccounting.abi.json'),
  [Contracts.MockFeeManager]:
    require('../out/MockFeeManager.abi.json'),
  [Contracts.MockFee]:
    require('../out/MockFee.abi.json'),
  [Contracts.MockHub]:
    require('../out/MockHub.abi.json'),
  [Contracts.MockRegistry]:
    require('../out/MockRegistry.abi.json'),
  [Contracts.MockShares]:
    require('../out/MockShares.abi.json'),
  [Contracts.MockVersion]:
    require('../out/MockVersion.abi.json'),
  [Contracts.MatchingMarket]:
    require('../out/MatchingMarket.abi.json'),
  [Contracts.MatchingMarketAdapter]:
    require('../out/MatchingMarketAdapter.abi.json'),
  [Contracts.Participation]:
    require('../out/Participation.abi.json'),
  [Contracts.ParticipationFactory]:
    require(`../out/${Contracts.ParticipationFactory}.abi.json`),
  [Contracts.PerformanceFee]:
    require('../out/PerformanceFee.abi.json'),
  [Contracts.PermissiveAuthority]:
    require(`../out/${Contracts.PermissiveAuthority}.abi.json`),
  [Contracts.Policy]:
    require('../out/Policy.abi.json'),
  [Contracts.PolicyManager]:
    require('../out/PolicyManager.abi.json'),
  [Contracts.PolicyManagerFactory]:
    require(`../out/${Contracts.PolicyManagerFactory}.abi.json`),
  [Contracts.PreminedToken]:
    require('../out/PreminedToken.abi.json'),
  [Contracts.PriceTolerance]:
    require(`../out/${Contracts.PriceTolerance}.abi.json`),
  [Contracts.Registry]:
    require('../out/Registry.abi.json'),
  [Contracts.PriceSourceInterface]:
    require('../out/PriceSourceInterface.abi.json'),
  [Contracts.SelfDestructing]:
    require('../out/SelfDestructing.abi.json'),
  [Contracts.Shares]:
    require('../out/Shares.abi.json'),
  [Contracts.SharesFactory]:
    require(`../out/${Contracts.SharesFactory}.abi.json`),
  [Contracts.Spoke]:
    require(`../out/${Contracts.Spoke}.abi.json`),
  [Contracts.StakingPriceFeed]:
    require(`../out/${Contracts.StakingPriceFeed}.abi.json`,),
  [Contracts.StandardToken]:
    require('../out/StandardToken.abi.json'),
  [Contracts.TestingPriceFeed]:
    require('../out/TestingPriceFeed.abi.json'),
  [Contracts.Trading]:
    require('../out/Trading.abi.json'),
  [Contracts.TradingFactory]:
    require(`../out/${Contracts.TradingFactory}.abi.json`),
  [Contracts.TruePolicy]:
    require('../out/TruePolicy.abi.json'),
  [Contracts.UserWhitelist]:
    require(`../out/${Contracts.UserWhitelist}.abi.json`),
  [Contracts.Vault]:
    require('../out/Vault.abi.json'),
  [Contracts.VaultFactory]:
    require('../out/VaultFactory.abi.json'),
  [Contracts.Version]:
    require('../out/Version.abi.json'),
  [Contracts.Weth]:
    require('../out/WETH.abi.json'),
  [Contracts.WrapperLock]:
    require(`../out/${Contracts.WrapperLock}.abi.json`),
  [Contracts.WrapperLockEth]:
    require(`../out/${Contracts.WrapperLockEth}.abi.json`),
  [Contracts.WrapperRegistryEFX]:
    require(`../out/${Contracts.WrapperRegistryEFX}.abi.json`),
  [Contracts.ZeroExExchange]:
    require('../out/Exchange.abi.json'),
  [Contracts.ZeroExAdapter]:
    require('../out/ZeroExV2Adapter.abi.json'),
};

const allAbis = R.toPairs(requireMap);
const onlyEvents = R.propEq('type', 'event');

interface ABIInput {
  indexed: boolean;
  name: string;
  type: string;
}

interface EventSignatureABIEntry {
  anonymous: boolean;
  name: string;
  type: 'event';
  inputs: ABIInput[];
}

/***
 * The key is the signature: web3EthAbi.encodeEventSignature(eventAbi)
 *
 * So if you observe an event, you can lookup its abi like:
 * const eventABI = eventSignatureABIMap[event.logs[0].topics[0]]
 * */
type EventSignatureABIMap = {
  [key: string]: EventSignatureABIEntry;
};

export const eventSignatureABIMap: EventSignatureABIMap = allAbis.reduce(
  (carry, [contract, abi]) => {
    const events = R.filter(onlyEvents, abi);
    const signatureToEvents = R.map(eventAbi => [
      web3EthAbi.encodeEventSignature(eventAbi),
      eventAbi,
    ])(events);
    return {
      ...carry,
      ...R.fromPairs(signatureToEvents),
    };
  },
  {},
);

// Note: We need this as a string enum to have a readable export to JSON
export enum Exchanges {
  MatchingMarket = 'MatchingMarket',
  KyberNetwork = 'KyberNetwork',
  ZeroEx = 'ZeroEx',
  Ethfinex = 'Ethfinex',
  MelonEngine = 'MelonEngine',
}
