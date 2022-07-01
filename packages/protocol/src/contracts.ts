import type { AddressLike, Call, Contract, Send } from '@enzymefinance/ethers';
import { contract } from '@enzymefinance/ethers';
import type { BigNumber, BigNumberish } from 'ethers';

// Persistent core
export * from './codegen/Dispatcher';
export * from './codegen/VaultProxy';

// Persistent release interfaces
export * from './codegen/IMigrationHookHandler';

// Persistent
export * from './codegen/AddressListRegistry';
export * from './codegen/FundValueCalculatorRouter';
export * from './codegen/FundValueCalculatorUsdWrapper';
export * from './codegen/GlobalConfigLib';
export * from './codegen/GlobalConfigProxy';
export * from './codegen/ManualValueOracleFactory';
export * from './codegen/ManualValueOracleLib';
export * from './codegen/SharesSplitterFactory';
export * from './codegen/SharesSplitterLib';
export * from './codegen/UintListRegistry';

// Release core
export * from './codegen/FundDeployer';
export * from './codegen/ComptrollerLib';
export * from './codegen/ComptrollerProxy';
export * from './codegen/VaultLib';

// Infrastructure
export * from './codegen/ConvexCurveLpStakingWrapperFactory';
export * from './codegen/ConvexCurveLpStakingWrapperLib';
export * from './codegen/ProtocolFeeReserveLib';
export * from './codegen/ProtocolFeeReserveProxy';
export * from './codegen/ProtocolFeeTracker';
export * from './codegen/UsdEthSimulatedAggregator';
export * from './codegen/ValueInterpreter';

// Extensions
export * from './codegen/IExtension';
export * from './codegen/IExternalPosition';
export * from './codegen/ExternalPositionFactory';
export * from './codegen/ExternalPositionManager';
export * from './codegen/IExternalPositionProxy';
export * from './codegen/FeeManager';
export * from './codegen/IntegrationManager';
export * from './codegen/PolicyManager';

// Derivative price feeds
export * from './codegen/IDerivativePriceFeed';
export * from './codegen/AavePriceFeed';
export * from './codegen/CompoundPriceFeed';
export * from './codegen/ConvexCurveLpStakingWrapperPriceFeed';
export * from './codegen/CurvePriceFeed';
export * from './codegen/FiduPriceFeed';
export * from './codegen/FusePriceFeed';
export * from './codegen/IdlePriceFeed';
export * from './codegen/LidoStethPriceFeed';
export * from './codegen/PoolTogetherV4PriceFeed';
export * from './codegen/RevertingPriceFeed';
export * from './codegen/UniswapV2PoolPriceFeed';
export * from './codegen/YearnVaultV2PriceFeed';

// Integration adapters
export * from './codegen/AaveAdapter';
export * from './codegen/CompoundAdapter';
export * from './codegen/ConvexCurveLpStakingAdapter';
export * from './codegen/CurveExchangeAdapter';
export * from './codegen/CurveLiquidityAdapter';
export * from './codegen/FuseAdapter';
export * from './codegen/IdleAdapter';
export * from './codegen/OlympusV2Adapter';
export * from './codegen/ParaSwapV5Adapter';
export * from './codegen/PoolTogetherV4Adapter';
export * from './codegen/SynthetixAdapter';
export * from './codegen/UniswapV2ExchangeAdapter';
export * from './codegen/UniswapV2LiquidityAdapter';
export * from './codegen/UniswapV3Adapter';
export * from './codegen/YearnVaultV2Adapter';
export * from './codegen/ZeroExV2Adapter';

// External positions
export * from './codegen/AaveDebtPositionParser';
export * from './codegen/AaveDebtPositionLib';
export * from './codegen/ArbitraryLoanFixedInterestModule';
export * from './codegen/ArbitraryLoanPositionParser';
export * from './codegen/ArbitraryLoanPositionLib';
export * from './codegen/ArbitraryLoanTotalNominalDeltaOracleModule';
export * from './codegen/CompoundDebtPositionParser';
export * from './codegen/CompoundDebtPositionLib';
export * from './codegen/ConvexVotingPositionParser';
export * from './codegen/ConvexVotingPositionLib';
export * from './codegen/IExternalPositionParser';
export * from './codegen/MapleLiquidityPositionParser';
export * from './codegen/MapleLiquidityPositionLib';
export * from './codegen/LiquityDebtPositionLib';
export * from './codegen/LiquityDebtPositionParser';
export * from './codegen/SolvV2ConvertibleBuyerPositionLib';
export * from './codegen/SolvV2ConvertibleBuyerPositionParser';
export * from './codegen/SolvV2ConvertibleIssuerPositionLib';
export * from './codegen/SolvV2ConvertibleIssuerPositionParser';
export * from './codegen/TheGraphDelegationPositionLib';
export * from './codegen/TheGraphDelegationPositionParser';
export * from './codegen/UniswapV3LiquidityPositionParser';
export * from './codegen/UniswapV3LiquidityPositionLib';

// Fees
export * from './codegen/IFee';
export * from './codegen/EntranceRateBurnFee';
export * from './codegen/EntranceRateDirectFee';
export * from './codegen/ExitRateBurnFee';
export * from './codegen/ExitRateDirectFee';
export * from './codegen/ManagementFee';
export * from './codegen/MinSharesSupplyFee';
export * from './codegen/PerformanceFee';

// Policies
export * from './codegen/IPolicy';
export * from './codegen/AllowedAdapterIncomingAssetsPolicy';
export * from './codegen/AllowedAdaptersPolicy';
export * from './codegen/AllowedAdaptersPerManagerPolicy';
export * from './codegen/AllowedAssetsForRedemptionPolicy';
export * from './codegen/AllowedDepositRecipientsPolicy';
export * from './codegen/AllowedExternalPositionTypesPerManagerPolicy';
export * from './codegen/AllowedExternalPositionTypesPolicy';
export * from './codegen/AllowedSharesTransferRecipientsPolicy';
export * from './codegen/CumulativeSlippageTolerancePolicy';
export * from './codegen/MinAssetBalancesPostRedemptionPolicy';
export * from './codegen/MinMaxInvestmentPolicy';
export * from './codegen/OnlyRemoveDustExternalPositionPolicy';
export * from './codegen/OnlyUntrackDustOrPricelessAssetsPolicy';

// Peripheral
export * from './codegen/DepositWrapper';
export * from './codegen/FundValueCalculator';
export * from './codegen/UnpermissionedActionsWrapper';

// Test contracts
export * from './codegen/ITestGoldfinchConfig';
export * from './codegen/ITestGoldfinchSeniorPool';
export * from './codegen/ITestMapleGlobals';
export * from './codegen/ITestMaplePool';
export * from './codegen/ITestSolvV2ConvertiblePool';
export * from './codegen/ITestSolvV2ConvertibleVoucher';
export * from './codegen/ITestSolvV2InitialConvertibleOfferingMarket';
export * from './codegen/ITestSolvV2ManualPriceOracle';
export * from './codegen/ITestSolvV2PriceOracleManager';
export * from './codegen/ITestTheGraphEpochManager';
export * from './codegen/ITestTheGraphStaking';
export * from './codegen/ITestSolvV2ConvertibleMarket';
export * from './codegen/ITestSolvV2ConvertiblePool';
export * from './codegen/ITestSolvV2ConvertibleVoucher';
export * from './codegen/ITestSolvV2InitialConvertibleOfferingMarket';
export * from './codegen/ITestSolvV2ManualPriceOracle';
export * from './codegen/ITestSolvV2PriceOracleManager';
export * from './codegen/SelfDestructEthPayer';
export * from './codegen/TestAddressArrayLib';
export * from './codegen/TestNominatedOwnerMixin';
export * from './codegen/TestPeggedDerivativesPriceFeed';
export * from './codegen/TestPricelessAssetBypassMixin';
export * from './codegen/TestSinglePeggedDerivativePriceFeed';
export * from './codegen/TestSingleUnderlyingDerivativeRegistry';
export * from './codegen/TestTreasurySplitterMixin';
export * from './codegen/TestUpdatableFeeRecipientBase';

// Mocks
export * from './codegen/MockVaultLib';
export * from './codegen/MockGenericAdapter';
export * from './codegen/MockGenericIntegratee';
export * from './codegen/MockGenericExternalPositionLib';
export * from './codegen/MockGenericExternalPositionParser';
export * from './codegen/MockToken';
export * from './codegen/MockReentrancyToken';
export * from './codegen/MockChainlinkPriceSource';

// Gas relayer
export * from './codegen/GasRelayPaymasterFactory';
export * from './codegen/GasRelayPaymasterLib';

// External interfaces
export * from './codegen/ICERC20';
export * from './codegen/ICEther';
export * from './codegen/IChainlinkAggregator';
export * from './codegen/IConvexBooster';
export * from './codegen/ICurveAddressProvider';
export * from './codegen/ICurveLiquidityGaugeV2';
export * from './codegen/ICurveLiquidityPool';
export * from './codegen/IGsnRelayHub';
export * from './codegen/IIdleTokenV4';
export * from './codegen/ISynthetixExchanger';
export * from './codegen/ISynthetixProxyERC20';
export * from './codegen/ISynthetixSynth';
export * from './codegen/IUniswapV2Factory';
export * from './codegen/IUniswapV2Pair';
export * from './codegen/IUniswapV2Router2';
export * from './codegen/IYearnVaultV2';

export interface StandardToken extends Contract<StandardToken> {
  allowance: Call<(owner: AddressLike, spender: AddressLike) => BigNumber>;
  approve: Send<(spender: AddressLike, amount: BigNumberish) => boolean>;
  balanceOf: Call<(account: AddressLike) => BigNumber>;
  decimals: Call<() => BigNumber>;
  symbol: Call<() => string>;
  totalSupply: Call<() => BigNumber>;
  transfer: Send<(recipient: AddressLike, amount: BigNumberish) => boolean>;
  transferFrom: Send<(sender: AddressLike, recipient: AddressLike, amount: BigNumberish) => boolean>;
}

export const StandardToken = contract<StandardToken>()`
  event Approval(address indexed owner, address indexed spender, uint256 value)
  event Transfer(address indexed from, address indexed to, uint256 value)
  function allowance(address owner, address spender) view returns (uint256)
  function approve(address spender, uint256 amount) returns (bool)
  function balanceOf(address account) view returns (uint256)
  function decimals() view returns (uint8)
  function symbol() view returns (string)
  function totalSupply() view returns (uint256)
  function transfer(address recipient, uint256 amount) returns (bool)
  function transferFrom(address sender, address recipient, uint256 amount) returns (bool)
`;

export interface WETH extends Contract<WETH> {
  allowance: Call<(owner: AddressLike, spender: AddressLike) => BigNumber>;
  approve: Send<(spender: AddressLike, amount: BigNumberish) => boolean>;
  balanceOf: Call<(account: AddressLike) => BigNumber>;
  decimals: Call<() => BigNumber>;
  symbol: Call<() => string>;
  totalSupply: Call<() => BigNumber>;
  transfer: Send<(recipient: AddressLike, amount: BigNumberish) => boolean>;
  transferFrom: Send<(sender: AddressLike, recipient: AddressLike, amount: BigNumberish) => boolean>;
  deposit: Send<() => void>;
  withdraw: Send<(amount: BigNumberish) => void>;
}

export const WETH = contract<WETH>()`
  event Approval(address indexed owner, address indexed spender, uint256 value)
  event Transfer(address indexed from, address indexed to, uint256 value)
  event Deposit(address indexed destination, uint256 value)
  event Withdrawal(address indexed source, uint256 value)
  function allowance(address owner, address spender) view returns (uint256)
  function approve(address spender, uint256 amount) returns (bool)
  function balanceOf(address account) view returns (uint256)
  function decimals() view returns (uint8)
  function symbol() view returns (string)
  function totalSupply() view returns (uint256)
  function transfer(address recipient, uint256 amount) returns (bool)
  function transferFrom(address sender, address recipient, uint256 amount) returns (bool)
  function deposit()
  function withdraw(uint256 amount)
`;

export interface UniswapV2Router extends Contract<UniswapV2Router> {
  getAmountsOut: Call<(amountIn: BigNumberish, path: AddressLike[]) => BigNumber[]>;
  quote: Call<(amountA: BigNumberish, reserveA: BigNumberish, reserveB: BigNumberish) => BigNumber>;
  swapExactTokensForTokens: Send<
    (
      amountIn: BigNumberish,
      amountOutMin: BigNumberish,
      path: AddressLike[],
      to: AddressLike,
      deadline: BigNumberish,
    ) => BigNumber[]
  >;
}

export const UniswapV2Router = contract<UniswapV2Router>()`
  function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])
  function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) pure returns (uint256)
  function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])
`;
