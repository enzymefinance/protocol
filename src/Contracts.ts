import * as R from 'ramda';
import * as web3EthAbi from 'web3-eth-abi';

export enum Contracts {
  Accounting = 'fund/accounting/Accounting',
  AmguConsumer = 'engine/AmguConsumer',
  AssetBlacklist = 'fund/policies/risk-management/AssetBlacklist',
  AssetWhitelist = 'fund/policies/risk-management/AssetWhitelist',
  BurnableToken = 'dependencies/token/BurnableToken',
  Engine = 'engine/Engine',
  FalsePolicy = 'fund/policies/FalsePolicy',
  FeeManager = 'fund/fees/FeeManager',
  ERC20Proxy = 'exchanges/thirdparty/0x/ERC20Proxy',
  FundFactory = 'factory/FundFactory',
  GenericExchange = 'exchanges/GenericExchange',
  Hub = 'fund/hub/Hub',
  MatchingMarket = 'exchanges/MatchingMarket',
  MatchingMarketAdapter = 'exchanges/MatchingMarketAdapter',
  MockAdapter = 'exchanges/MockAdapter',
  KyberNetwork = 'exchanges/KyberNetwork',
  KyberNetworkProxy = 'exchanges/KyberNetworkProxy',
  KyberAdapter = 'exchanges/KyberAdapter',
  KyberReserve = 'exchanges/KyberReserve',
  ConversionRates = 'exchanges/ConversionRates',
  KyberWhiteList = 'exchanges/KyberWhiteList',
  MaxPositions = 'fund/policies/risk-management/MaxPositions',
  MaxConcentration = 'fund/policies/risk-management/MaxConcentration',
  MockAccounting = 'fund/accounting/MockAccounting',
  MockFeeManager = 'fund/fees/MockFeeManager',
  MockFee = 'fund/fees/MockFee',
  MockHub = 'fund/hub/MockHub',
  MockShares = 'fund/shares/MockShares',
  MockVersion = 'version/MockVersion',
  Participation = 'fund/participation/Participation',
  PolicyManager = 'fund/policies/PolicyManager',
  PreminedToken = 'dependencies/token/PreminedToken',
  SelfDestructing = 'testing/SelfDestructing',
  Shares = 'fund/shares/Shares',
  Spoke = 'fund/shares/Spoke',
  StandardToken = 'dependencies/token/StandardToken',
  TestingPriceFeed = 'prices/TestingPriceFeed',
  Trading = 'fund/trading/Trading',
  TruePolicy = 'fund/policies/TruePolicy',
  Vault = 'fund/vault/Vault',
  VaultFactory = 'fund/vault/VaultFactory',
  Version = 'version/Version',
  ZeroExExchange = 'exchanges/thirdparty/0x/Exchange',
  ZeroExAdapter = 'exchanges/ZeroExV2Adapter',
}

// HINT: Link the interfaces instead of the implementations wherever possible
// (to maintain extensibility)
// prettier-ignore
export const requireMap = {
  [Contracts.Accounting]:
    require('../out/fund/accounting/Accounting.abi.json'),
  [Contracts.AmguConsumer]:
    require('../out/engine/AmguConsumer.abi.json'),
  [Contracts.AssetBlacklist]:
    require('../out/fund/policies/risk-management/AssetBlacklist.abi.json'),
  [Contracts.AssetWhitelist]:
    require('../out/fund/policies/risk-management/AssetWhitelist.abi.json'),
  [Contracts.BurnableToken]:
    require('../out/dependencies/token/BurnableToken.abi.json'),
  [Contracts.ERC20Proxy]:
    require(`../out/${Contracts.ERC20Proxy}.abi.json`),
  [Contracts.Engine]:
    require('../out/engine/Engine.abi.json'),
  [Contracts.FalsePolicy]:
    require('../out/fund/policies/FalsePolicy.abi.json'),
  [Contracts.FeeManager]:
    require('../out/fund/fees/FeeManager.abi.json'),
  [Contracts.FundFactory]:
    require('../out/factory/FundFactory.abi.json'),
  [Contracts.GenericExchange]:
    require('../out/exchanges/GenericExchangeInterface.abi.json'),
  [Contracts.Hub]:
    require('../out/fund/hub/Hub.abi.json'),
  [Contracts.MockAdapter]:
    require('../out/exchanges/MockAdapter.abi.json'),
  [Contracts.MatchingMarket]:
    require('../out/exchanges/thirdparty/oasisdex/MatchingMarket.abi.json'),
  [Contracts.MatchingMarketAdapter]:
    require('../out/exchanges/MatchingMarketAdapter.abi.json'),
  [Contracts.KyberNetwork]:
    require('../out/exchanges/thirdparty/kyber/KyberNetwork.abi.json'),
  [Contracts.KyberReserve]:
    require('../out/exchanges/thirdparty/kyber/KyberReserve.abi.json'),
  [Contracts.KyberNetworkProxy]:
    require('../out/exchanges/thirdparty/kyber/KyberNetworkProxy.abi.json'),
  [Contracts.KyberAdapter]:
    require('../out/exchanges/KyberAdapter.abi.json'),
  [Contracts.ConversionRates]:
    require('../out/exchanges/thirdparty/kyber/ConversionRates.abi.json'),
  [Contracts.KyberWhiteList]:
    require('../out/exchanges/thirdparty/kyber/KyberWhiteList.abi.json'),
  [Contracts.MaxPositions]:
    require('../out/fund/policies/risk-management/MaxPositions.abi.json'),
  [Contracts.MaxConcentration]:
    require('../out/fund/policies/risk-management/MaxConcentration.abi.json'),
  [Contracts.MockAccounting]:
    require('../out/fund/accounting/MockAccounting.abi.json'),
  [Contracts.MockFeeManager]:
    require('../out/fund/fees/MockFeeManager.abi.json'),
  [Contracts.MockFee]:
    require('../out/fund/fees/MockFee.abi.json'),
  [Contracts.MockHub]:
    require('../out/fund/hub/MockHub.abi.json'),
  [Contracts.MockShares]:
    require('../out/fund/shares/MockShares.abi.json'),
  [Contracts.MockVersion]:
    require('../out/version/MockVersion.abi.json'),
  [Contracts.MatchingMarket]:
    require('../out/exchanges/thirdparty/oasisdex/MatchingMarket.abi.json'),
  [Contracts.MatchingMarketAdapter]:
    require('../out/exchanges/MatchingMarketAdapter.abi.json'),
  [Contracts.Participation]:
    require('../out/fund/participation/Participation.abi.json'),
  [Contracts.PolicyManager]:
    require('../out/fund/policies/PolicyManager.abi.json'),
  [Contracts.PreminedToken]:
    require('../out/dependencies/token/PreminedToken.abi.json'),
  [Contracts.SelfDestructing]:
    require('../out/testing/SelfDestructing.abi.json'),
  [Contracts.Shares]:
    require('../out/fund/shares/Shares.abi.json'),
  [Contracts.Spoke]:
    require('../out/fund/hub/Spoke.abi.json'),
  [Contracts.StandardToken]:
    require('../out/dependencies/token/StandardToken.abi.json'),
  [Contracts.TestingPriceFeed]:
    require('../out/prices/TestingPriceFeed.abi.json'),
  [Contracts.Trading]:
    require('../out/fund/trading/Trading.abi.json'),
  [Contracts.TruePolicy]:
    require('../out/fund/policies/TruePolicy.abi.json'),
  [Contracts.Vault]:
    require('../out/fund/vault/Vault.abi.json'),
  [Contracts.VaultFactory]:
    require('../out/fund/vault/VaultFactory.abi.json'),
  [Contracts.Version]:
    require('../out/version/Version.abi.json'),
  [Contracts.ZeroExExchange]:
    require('../out/exchanges/thirdparty/0x/Exchange.abi.json'),
  [Contracts.ZeroExAdapter]:
    require('../out/exchanges/ZeroExV2Adapter.abi.json'),
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
}
