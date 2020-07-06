import config from '~/config';
import { Contract } from '~/framework/contract';
import * as contracts from '~/framework/contracts';

// TOKENS
export const WETH = new contracts.WETH(config.tokens.WETH);
export const MLN = new contracts.ERC20WithFields(config.tokens.MLN);
export const ANT = new contracts.ERC20WithFields(config.tokens.ANT);
export const BAT = new contracts.ERC20WithFields(config.tokens.BAT);
export const DAI = new contracts.ERC20WithFields(config.tokens.DAI);
export const KNC = new contracts.ERC20WithFields(config.tokens.KNC);
export const LINK = new contracts.ERC20WithFields(config.tokens.LINK);
export const MANA = new contracts.ERC20WithFields(config.tokens.MANA);
export const MKR = new contracts.ERC20WithFields(config.tokens.MKR);
export const REP = new contracts.ERC20WithFields(config.tokens.REP);
export const REN = new contracts.ERC20WithFields(config.tokens.REN);
export const RLC = new contracts.ERC20WithFields(config.tokens.RLC);
export const SAI = new contracts.ERC20WithFields(config.tokens.SAI);
export const USDC = new contracts.ERC20WithFields(config.tokens.USDC);
export const WBTC = new contracts.ERC20WithFields(config.tokens.WBTC);
export const ZRX = new contracts.ERC20WithFields(config.tokens.ZRX);

// ADAPTERS
export const KyberAdapter = Contract.fromArtifact(contracts.KyberAdapter);
export const ZeroExV2Adapter = Contract.fromArtifact(contracts.ZeroExV2Adapter);
export const ZeroExV3Adapter = Contract.fromArtifact(contracts.ZeroExV3Adapter);
export const UniswapAdapter = Contract.fromArtifact(contracts.UniswapAdapter);
export const AirSwapAdapter = Contract.fromArtifact(contracts.AirSwapAdapter);
export const EngineAdapter = Contract.fromArtifact(contracts.EngineAdapter);
export const OasisDexAdapter = Contract.fromArtifact(contracts.OasisDexAdapter);

// POLICIES
export const AssetBlacklist = Contract.fromArtifact(contracts.AssetBlacklist);
export const AssetWhitelist = Contract.fromArtifact(contracts.AssetWhitelist);
export const UserWhitelist = Contract.fromArtifact(contracts.UserWhitelist);
export const PriceTolerance = Contract.fromArtifact(contracts.PriceTolerance);
export const MaxConcentration = Contract.fromArtifact(contracts.MaxConcentration);
export const MaxPositions = Contract.fromArtifact(contracts.MaxPositions);

// FEES
export const PerformanceFee = Contract.fromArtifact(contracts.PerformanceFee);
export const ManagementFee = Contract.fromArtifact(contracts.ManagementFee);

// FACTORIES
export const FundFactory = Contract.fromArtifact(contracts.FundFactory);
export const FeeManagerFactory = Contract.fromArtifact(contracts.FeeManagerFactory);
export const PolicyManagerFactory = Contract.fromArtifact(contracts.PolicyManagerFactory);

// CORE
export const Registry = Contract.fromArtifact(contracts.Registry);
export const Engine = Contract.fromArtifact(contracts.Engine);
export const KyberPriceFeed = Contract.fromArtifact(contracts.KyberPriceFeed);
