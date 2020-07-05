import config from '~/config';
import { Contract } from '~/framework/contract';
import * as contracts from '~/framework/contracts';

// prettier-ignore-start

// TOKENS
export const WETH = new contracts.WETH(config.tokens.WETH, ethersProvider);
export const MLN = new contracts.ERC20WithFields(config.tokens.MLN, ethersProvider);
export const ANT = new contracts.ERC20WithFields(config.tokens.ANT,ethersProvider);
export const BAT = new contracts.ERC20WithFields(config.tokens.BAT,ethersProvider);
export const DAI = new contracts.ERC20WithFields(config.tokens.DAI,ethersProvider);
export const KNC = new contracts.ERC20WithFields(config.tokens.KNC,ethersProvider);
export const LINK = new contracts.ERC20WithFields(config.tokens.LINK,ethersProvider);
export const MANA = new contracts.ERC20WithFields(config.tokens.MANA,ethersProvider);
export const MKR = new contracts.ERC20WithFields(config.tokens.MKR,ethersProvider);
export const REP = new contracts.ERC20WithFields(config.tokens.REP,ethersProvider);
export const REN = new contracts.ERC20WithFields(config.tokens.REN,ethersProvider);
export const RLC = new contracts.ERC20WithFields(config.tokens.RLC,ethersProvider);
export const SAI = new contracts.ERC20WithFields(config.tokens.SAI,ethersProvider);
export const USDC = new contracts.ERC20WithFields(config.tokens.USDC,ethersProvider);
export const WBTC = new contracts.ERC20WithFields(config.tokens.WBTC,ethersProvider);
export const ZRX = new contracts.ERC20WithFields(config.tokens.ZRX,ethersProvider);

// ADAPTERS
export const KyberAdapter = Contract.fromArtifact(contracts.KyberAdapter,ethersProvider);
export const ZeroExV2Adapter = Contract.fromArtifact(contracts.ZeroExV2Adapter,ethersProvider);
export const ZeroExV3Adapter = Contract.fromArtifact(contracts.ZeroExV3Adapter,ethersProvider);
export const UniswapAdapter = Contract.fromArtifact(contracts.UniswapAdapter,ethersProvider);
export const AirSwapAdapter = Contract.fromArtifact(contracts.AirSwapAdapter,ethersProvider);
export const EngineAdapter = Contract.fromArtifact(contracts.EngineAdapter,ethersProvider);
export const OasisDexAdapter = Contract.fromArtifact(contracts.OasisDexAdapter,ethersProvider);

// POLICIES
export const AssetBlacklist = Contract.fromArtifact(contracts.AssetBlacklist,ethersProvider);
export const AssetWhitelist = Contract.fromArtifact(contracts.AssetWhitelist,ethersProvider);
export const UserWhitelist = Contract.fromArtifact(contracts.UserWhitelist,ethersProvider);
export const PriceTolerance = Contract.fromArtifact(contracts.PriceTolerance,ethersProvider);
export const MaxConcentration = Contract.fromArtifact(contracts.MaxConcentration,ethersProvider);
export const MaxPositions = Contract.fromArtifact(contracts.MaxPositions,ethersProvider);

// FEES
export const PerformanceFee = Contract.fromArtifact(contracts.PerformanceFee,ethersProvider);
export const ManagementFee = Contract.fromArtifact(contracts.ManagementFee,ethersProvider);

// FACTORIES
export const FundFactory = Contract.fromArtifact(contracts.FundFactory,ethersProvider);
export const FeeManagerFactory = Contract.fromArtifact(contracts.FeeManagerFactory,ethersProvider);
export const PolicyManagerFactory = Contract.fromArtifact(contracts.PolicyManagerFactory,ethersProvider);

// CORE
export const Registry = Contract.fromArtifact(contracts.Registry,ethersProvider);
export const Engine = Contract.fromArtifact(contracts.Engine, ethersProvider);
export const KyberPriceFeed = Contract.fromArtifact(contracts.KyberPriceFeed,ethersProvider);

// prettier-ignore-end
