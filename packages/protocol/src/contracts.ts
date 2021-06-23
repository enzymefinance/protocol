import { AddressLike, Call, Contract, contract, Send } from '@enzymefinance/ethers';
import { BigNumber, BigNumberish } from 'ethers';

// Persistent core
export * from './codegen/Dispatcher';
export * from './codegen/VaultProxy';

// Persistent release interfaces
export * from './codegen/IMigrationHookHandler';

// Release core
export * from './codegen/FundDeployer';
export * from './codegen/ComptrollerLib';
export * from './codegen/ComptrollerProxy';
export * from './codegen/VaultLib';

// Infrastructure
export * from './codegen/ValueInterpreter';

// Extensions
export * from './codegen/IExtension';
export * from './codegen/FeeManager';
export * from './codegen/IntegrationManager';
export * from './codegen/PolicyManager';

// Primitive price feeds
export * from './codegen/IPrimitivePriceFeed';
export * from './codegen/ChainlinkPriceFeed';

// Derivative price feeds
export * from './codegen/IDerivativePriceFeed';
export * from './codegen/AavePriceFeed';
export * from './codegen/AggregatedDerivativePriceFeed';
export * from './codegen/AlphaHomoraV1PriceFeed';
export * from './codegen/CompoundPriceFeed';
export * from './codegen/CurvePriceFeed';
export * from './codegen/IdlePriceFeed';
export * from './codegen/LidoStethPriceFeed';
export * from './codegen/RevertingPriceFeed';
export * from './codegen/StakehoundEthPriceFeed';
export * from './codegen/SynthetixPriceFeed';
export * from './codegen/UniswapV2PoolPriceFeed';
export * from './codegen/WdgldPriceFeed';
export * from './codegen/YearnVaultV2PriceFeed';

// Integration adapters
export * from './codegen/AaveAdapter';
export * from './codegen/AlphaHomoraV1Adapter';
export * from './codegen/CompoundAdapter';
export * from './codegen/CurveExchangeAdapter';
export * from './codegen/CurveLiquidityAaveAdapter';
export * from './codegen/CurveLiquidityEursAdapter';
export * from './codegen/CurveLiquiditySethAdapter';
export * from './codegen/CurveLiquidityStethAdapter';
export * from './codegen/IdleAdapter';
export * from './codegen/KyberAdapter';
export * from './codegen/ParaSwapV4Adapter';
export * from './codegen/SynthetixAdapter';
export * from './codegen/TrackedAssetsAdapter';
export * from './codegen/UniswapV2Adapter';
export * from './codegen/UniswapV3Adapter';
export * from './codegen/YearnVaultV2Adapter';
export * from './codegen/ZeroExV2Adapter';

// Fees
export * from './codegen/IFee';
export * from './codegen/EntranceRateBurnFee';
export * from './codegen/EntranceRateDirectFee';
export * from './codegen/ManagementFee';
export * from './codegen/PerformanceFee';

// Policies
export * from './codegen/IPolicy';
export * from './codegen/AdapterBlacklist';
export * from './codegen/AdapterWhitelist';
export * from './codegen/AssetBlacklist';
export * from './codegen/AssetWhitelist';
export * from './codegen/BuySharesCallerWhitelist';
export * from './codegen/GuaranteedRedemption';
export * from './codegen/MaxConcentration';
export * from './codegen/MinMaxInvestment';
export * from './codegen/InvestorWhitelist';

// Peripheral
export * from './codegen/AuthUserExecutedSharesRequestorFactory';
export * from './codegen/AuthUserExecutedSharesRequestorLib';
export * from './codegen/AuthUserExecutedSharesRequestorProxy';
export * from './codegen/FundActionsWrapper';

// Test contracts
export * from './codegen/TestPeggedDerivativesPriceFeed';
export * from './codegen/TestSinglePeggedDerivativePriceFeed';
export * from './codegen/TestSingleUnderlyingDerivativeRegistry';

// Mocks

export * from './codegen/MockVaultLib';
export * from './codegen/CentralizedRateProvider';
export * from './codegen/MockCEtherIntegratee';
export * from './codegen/MockCTokenIntegratee';
export * from './codegen/MockGenericAdapter';
export * from './codegen/MockGenericIntegratee';
export * from './codegen/MockKyberIntegratee';
export * from './codegen/MockChainlinkPriceSource';
export * from './codegen/MockToken';
export * from './codegen/MockReentrancyToken';
export * from './codegen/MockSynthetixToken';
export * from './codegen/MockSynthetixIntegratee';
export * from './codegen/MockSynthetixPriceSource';
export * from './codegen/MockZeroExV2Integratee';
export * from './codegen/MockUniswapV2Integratee';
export * from './codegen/MockUniswapV2PriceSource';
export * from './codegen/WETH';

// External interfaces
export * from './codegen/IAlphaHomoraV1Bank';
export * from './codegen/ICERC20';
export * from './codegen/ICEther';
export * from './codegen/IChainlinkAggregator';
export * from './codegen/ICurveAddressProvider';
export * from './codegen/ICurveLiquidityGaugeV2';
export * from './codegen/ICurveLiquidityPool';
export * from './codegen/ICurveRegistry';
export * from './codegen/ICurveStableSwapSteth';
export * from './codegen/IIdleTokenV4';
export * from './codegen/IKyberNetworkProxy';
export * from './codegen/IMakerDaoPot';
export * from './codegen/ISynthetixAddressResolver';
export * from './codegen/ISynthetixDelegateApprovals';
export * from './codegen/ISynthetixExchangeRates';
export * from './codegen/ISynthetixExchanger';
export * from './codegen/IUniswapV2Factory';
export * from './codegen/IUniswapV2Pair';
export * from './codegen/IUniswapV2Router2';
export * from './codegen/IYearnVaultV2';

// prettier-ignore
export interface StandardToken extends Contract<StandardToken> {
  allowance: Call<(owner: AddressLike, spender: AddressLike) => BigNumber, Contract<any>>
  approve: Send<(spender: AddressLike, amount: BigNumberish) => boolean, Contract<any>>
  balanceOf: Call<(account: AddressLike) => BigNumber, Contract<any>>
  decimals: Call<() => BigNumber, Contract<any>>
  symbol: Call<() => string, Contract<any>>
  totalSupply: Call<() => BigNumber, Contract<any>>
  transfer: Send<(recipient: AddressLike, amount: BigNumberish) => boolean, Contract<any>>
  transferFrom: Send<(sender: AddressLike, recipient: AddressLike, amount: BigNumberish) => boolean, Contract<any>>
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

export interface UniswapV2Router extends Contract<UniswapV2Router> {
  getAmountsOut: Call<(amountIn: BigNumberish, path: AddressLike[]) => BigNumber[], Contract<any>>;
  quote: Call<(amountA: BigNumberish, reserveA: BigNumberish, reserveB: BigNumberish) => BigNumber, Contract<any>>;
  swapExactTokensForTokens: Send<
    (
      amountIn: BigNumberish,
      amountOutMin: BigNumberish,
      path: AddressLike[],
      to: AddressLike,
      deadline: BigNumberish,
    ) => BigNumber[],
    Contract<any>
  >;
}

export const UniswapV2Router = contract<UniswapV2Router>()`
  function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])
  function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) pure returns (uint256)
  function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])
`;
