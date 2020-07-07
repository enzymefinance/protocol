import config from '~/config';
import { fromArtifact } from '~/framework/utils';
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
export const KyberAdapter = fromArtifact(contracts.KyberAdapter);
export const ZeroExV2Adapter = fromArtifact(contracts.ZeroExV2Adapter);
export const ZeroExV3Adapter = fromArtifact(contracts.ZeroExV3Adapter);
export const UniswapAdapter = fromArtifact(contracts.UniswapAdapter);
export const AirSwapAdapter = fromArtifact(contracts.AirSwapAdapter);
export const EngineAdapter = fromArtifact(contracts.EngineAdapter);
export const OasisDexAdapter = fromArtifact(contracts.OasisDexAdapter);

// POLICIES
export const AssetBlacklist = fromArtifact(contracts.AssetBlacklist);
export const AssetWhitelist = fromArtifact(contracts.AssetWhitelist);
export const UserWhitelist = fromArtifact(contracts.UserWhitelist);
export const PriceTolerance = fromArtifact(contracts.PriceTolerance);
export const MaxConcentration = fromArtifact(contracts.MaxConcentration);
export const MaxPositions = fromArtifact(contracts.MaxPositions);

// FEES
export const PerformanceFee = fromArtifact(contracts.PerformanceFee);
export const ManagementFee = fromArtifact(contracts.ManagementFee);

// FACTORIES
export const FundFactory = fromArtifact(contracts.FundFactory);
export const FeeManagerFactory = fromArtifact(contracts.FeeManagerFactory);
export const PolicyManagerFactory = fromArtifact(contracts.PolicyManagerFactory);

// CORE
export const Registry = fromArtifact(contracts.Registry);
export const Engine = fromArtifact(contracts.Engine);
export const KyberPriceFeed = fromArtifact(contracts.KyberPriceFeed);
