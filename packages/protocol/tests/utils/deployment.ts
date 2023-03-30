import {
  AaveDebtPositionLib,
  AaveDebtPositionParser,
  AaveV2Adapter,
  AaveV2ATokenListOwner,
  AaveV3Adapter,
  AaveV3ATokenListOwner,
  AddressListRegistry,
  AllowedAdapterIncomingAssetsPolicy,
  AllowedAdaptersPerManagerPolicy,
  AllowedAdaptersPolicy,
  AllowedAssetsForRedemptionPolicy,
  AllowedDepositRecipientsPolicy,
  AllowedExternalPositionTypesPerManagerPolicy,
  AllowedExternalPositionTypesPolicy,
  AllowedSharesTransferRecipientsPolicy,
  ArbitraryLoanFixedInterestModule,
  ArbitraryLoanPositionLib,
  ArbitraryLoanPositionParser,
  ArbitraryLoanTotalNominalDeltaOracleModule,
  ArbitraryTokenPhasedSharesWrapperFactory,
  AuraBalancerV2LpStakingAdapter,
  AuraBalancerV2LpStakingWrapperFactory,
  AuraBalancerV2LpStakingWrapperPriceFeed,
  BalancerV2GaugeTokenPriceFeed,
  BalancerV2LiquidityAdapter,
  BalancerV2StablePoolPriceFeed,
  BalancerV2WeightedPoolPriceFeed,
  CompoundAdapter,
  CompoundDebtPositionLib,
  CompoundDebtPositionParser,
  CompoundPriceFeed,
  CompoundV3Adapter,
  CompoundV3CTokenListOwner,
  ComptrollerLib,
  ConvexCurveLpStakingAdapter,
  ConvexCurveLpStakingWrapperFactory,
  ConvexCurveLpStakingWrapperPriceFeed,
  ConvexVotingPositionLib,
  ConvexVotingPositionParser,
  CumulativeSlippageTolerancePolicy,
  CurveExchangeAdapter,
  CurveLiquidityAdapter,
  CurvePriceFeed,
  DepositWrapper,
  Dispatcher,
  EntranceRateBurnFee,
  EntranceRateDirectFee,
  ExitRateBurnFee,
  ExitRateDirectFee,
  ExternalPositionFactory,
  ExternalPositionManager,
  FeeManager,
  FiduPriceFeed,
  FundDeployer,
  FundValueCalculator,
  FundValueCalculatorRouter,
  FundValueCalculatorUsdWrapper,
  GasRelayPaymasterFactory,
  GatedRedemptionQueueSharesWrapperFactory,
  GatedRedemptionQueueSharesWrapperLib,
  GlobalConfigLib,
  IdleAdapter,
  IdlePriceFeed,
  IntegrationManager,
  KilnStakingPositionLib,
  KilnStakingPositionParser,
  LiquityDebtPositionLib,
  LiquityDebtPositionParser,
  ManagementFee,
  ManualValueOracleFactory,
  MapleLiquidityPositionLib,
  MapleLiquidityPositionParser,
  MapleV1ToV2PoolMapper,
  MinAssetBalancesPostRedemptionPolicy,
  MinMaxInvestmentPolicy,
  MinSharesSupplyFee,
  NotionalV2PositionLib,
  NotionalV2PositionParser,
  OlympusV2Adapter,
  OnlyRemoveDustExternalPositionPolicy,
  OnlyUntrackDustOrPricelessAssetsPolicy,
  ParaSwapV5Adapter,
  PerformanceFee,
  PolicyManager,
  PoolTogetherV4Adapter,
  PoolTogetherV4PriceFeed,
  ProtocolFeeReserveLib,
  ProtocolFeeTracker,
  RevertingPriceFeed,
  SharesSplitterFactory,
  SynthetixAdapter,
  UintListRegistry,
  UniswapV2ExchangeAdapter,
  UniswapV2LiquidityAdapter,
  UniswapV2PoolPriceFeed,
  UniswapV3Adapter,
  UnpermissionedActionsWrapper,
  UsdEthSimulatedAggregator,
  ValueInterpreter,
  VaultLib,
  WstethPriceFeed,
  YearnVaultV2Adapter,
  YearnVaultV2PriceFeed,
  ZeroExV2Adapter,
} from '@enzymefinance/protocol';

export async function getNamedSigner(name: string) {
  const accounts = await hre.getNamedAccounts();

  if (!accounts[name]) {
    throw new Error(`Missing account with name ${name}`);
  }

  return provider.getSignerWithAddress(accounts[name]);
}

export async function getUnnamedSigners() {
  const accounts = await hre.getUnnamedAccounts();

  return Promise.all(accounts.map((account) => provider.getSignerWithAddress(account)));
}

export async function deployProtocolFixture() {
  const fixture = await hre.deployments.fixture();
  const deployer = await getNamedSigner('deployer');
  const accounts = await getUnnamedSigners();
  const config = fixture.Config.linkedData as DeploymentConfig;

  // prettier-ignore
  const deployment = {
    aaveDebtPositionLib: new AaveDebtPositionLib(fixture.AaveDebtPositionLib.address, deployer),
    aaveDebtPositionParser: new AaveDebtPositionParser(fixture.AaveDebtPositionParser.address, deployer),
    aaveV2Adapter: new AaveV2Adapter(fixture.AaveV2Adapter.address, deployer),
    aaveV2ATokenListOwner: new AaveV2ATokenListOwner(fixture.AaveV2ATokenListOwner.address, deployer),
    aaveV3Adapter: new AaveV3Adapter(fixture.AaveV3Adapter.address, deployer),
    aaveV3ATokenListOwner: new AaveV3ATokenListOwner(fixture.AaveV3ATokenListOwner.address, deployer),
    addressListRegistry: new AddressListRegistry(fixture.AddressListRegistry.address, deployer),
    allowedAdapterIncomingAssetsPolicy: new AllowedAdapterIncomingAssetsPolicy(fixture.AllowedAdapterIncomingAssetsPolicy.address, deployer),
    allowedAdaptersPerManagerPolicy: new AllowedAdaptersPerManagerPolicy(fixture.AllowedAdaptersPerManagerPolicy.address, deployer),
    allowedAdaptersPolicy: new AllowedAdaptersPolicy(fixture.AllowedAdaptersPolicy.address, deployer),
    allowedAssetsForRedemptionPolicy: new AllowedAssetsForRedemptionPolicy(fixture.AllowedAssetsForRedemptionPolicy.address, deployer),
    allowedDepositRecipientsPolicy: new AllowedDepositRecipientsPolicy(fixture.AllowedDepositRecipientsPolicy.address, deployer),
    allowedExternalPositionTypesPerManagerPolicy: new AllowedExternalPositionTypesPerManagerPolicy(fixture.AllowedExternalPositionTypesPerManagerPolicy.address, deployer),
    allowedExternalPositionTypesPolicy: new AllowedExternalPositionTypesPolicy(fixture.AllowedExternalPositionTypesPolicy.address, deployer),
    allowedSharesTransferRecipientsPolicy: new AllowedSharesTransferRecipientsPolicy(fixture.AllowedSharesTransferRecipientsPolicy.address, deployer),
    arbitraryLoanFixedInterestModule: new ArbitraryLoanFixedInterestModule(fixture.ArbitraryLoanFixedInterestModule.address, deployer),
    arbitraryLoanPositionLib: new ArbitraryLoanPositionLib(fixture.ArbitraryLoanPositionLib.address, deployer),
    arbitraryLoanPositionParser: new ArbitraryLoanPositionParser(fixture.ArbitraryLoanPositionParser.address, deployer),
    arbitraryLoanTotalNominalDeltaOracleModule: new ArbitraryLoanTotalNominalDeltaOracleModule(fixture.ArbitraryLoanTotalNominalDeltaOracleModule.address, deployer),
    arbitraryTokenPhasedSharesWrapperFactory: new ArbitraryTokenPhasedSharesWrapperFactory(fixture.ArbitraryTokenPhasedSharesWrapperFactory.address, deployer),
    auraBalancerV2LpStakingAdapter: new AuraBalancerV2LpStakingAdapter(fixture.AuraBalancerV2LpStakingAdapter, deployer),
    auraBalancerV2LpStakingWrapperFactory: new AuraBalancerV2LpStakingWrapperFactory(fixture.AuraBalancerV2LpStakingWrapperFactory, deployer),
    auraBalancerV2LpStakingWrapperPriceFeed: new AuraBalancerV2LpStakingWrapperPriceFeed(fixture.AuraBalancerV2LpStakingWrapperPriceFeed, deployer),
    balancerV2GaugeTokenPriceFeed: new BalancerV2GaugeTokenPriceFeed(fixture.BalancerV2GaugeTokenPriceFeed, deployer),
    balancerV2LiquidityAdapter: new BalancerV2LiquidityAdapter(fixture.BalancerV2LiquidityAdapter, deployer),
    balancerV2StablePoolPriceFeed: new BalancerV2StablePoolPriceFeed(fixture.BalancerV2StablePoolPriceFeed, deployer),
    balancerV2WeightedPoolPriceFeed: new BalancerV2WeightedPoolPriceFeed(fixture.BalancerV2WeightedPoolPriceFeed, deployer),
    compoundAdapter: new CompoundAdapter(fixture.CompoundAdapter.address, deployer),
    compoundDebtPositionLib: new CompoundDebtPositionLib(fixture.CompoundDebtPositionLib.address, deployer),
    compoundDebtPositionParser: new CompoundDebtPositionParser(fixture.CompoundDebtPositionParser.address, deployer),
    compoundPriceFeed: new CompoundPriceFeed(fixture.CompoundPriceFeed.address, deployer),
    compoundV3Adapter: new CompoundV3Adapter(fixture.CompoundV3Adapter.address, deployer),
    compoundV3CTokenListOwner: new CompoundV3CTokenListOwner(fixture.CompoundV3CTokenListOwner.address, deployer),
    comptrollerLib: new ComptrollerLib(fixture.ComptrollerLib.address, deployer),
    convexCurveLpStakingAdapter: new ConvexCurveLpStakingAdapter(fixture.ConvexCurveLpStakingAdapter.address, deployer),
    convexCurveLpStakingWrapperFactory: new ConvexCurveLpStakingWrapperFactory(fixture.ConvexCurveLpStakingWrapperFactory.address, deployer),
    convexCurveLpStakingWrapperPriceFeed: new ConvexCurveLpStakingWrapperPriceFeed(fixture.ConvexCurveLpStakingWrapperPriceFeed.address, deployer),
    convexVotingPositionLib: new ConvexVotingPositionLib(fixture.ConvexVotingPositionLib.address, deployer),
    convexVotingPositionParser: new ConvexVotingPositionParser(fixture.ConvexVotingPositionParser.address, deployer),
    cumulativeSlippageTolerancePolicy: new CumulativeSlippageTolerancePolicy(fixture.CumulativeSlippageTolerancePolicy.address, deployer),
    curveExchangeAdapter: new CurveExchangeAdapter(fixture.CurveExchangeAdapter.address, deployer),
    curveLiquidityAdapter: new CurveLiquidityAdapter(fixture.CurveLiquidityAdapter.address, deployer),
    curvePriceFeed: new CurvePriceFeed(fixture.CurvePriceFeed.address, deployer),
    depositWrapper: new DepositWrapper(fixture.DepositWrapper.address, deployer),
    dispatcher: new Dispatcher(fixture.Dispatcher.address, deployer),
    entranceRateBurnFee: new EntranceRateBurnFee(fixture.EntranceRateBurnFee.address, deployer),
    entranceRateDirectFee: new EntranceRateDirectFee(fixture.EntranceRateDirectFee.address, deployer),
    exitRateBurnFee: new ExitRateBurnFee(fixture.ExitRateBurnFee.address, deployer),
    exitRateDirectFee: new ExitRateDirectFee(fixture.ExitRateDirectFee.address, deployer),
    externalPositionFactory: new ExternalPositionFactory(fixture.ExternalPositionFactory.address, deployer),
    externalPositionManager: new ExternalPositionManager(fixture.ExternalPositionManager.address, deployer),
    feeManager: new FeeManager(fixture.FeeManager.address, deployer),
    fiduPriceFeed: new FiduPriceFeed(fixture.FiduPriceFeed.address, deployer),
    fundDeployer: new FundDeployer(fixture.FundDeployer.address, deployer),
    fundValueCalculator: new FundValueCalculator(fixture.FundValueCalculator.address, deployer),
    fundValueCalculatorRouter: new FundValueCalculatorRouter(fixture.FundValueCalculatorRouter.address, deployer),
    fundValueCalculatorUsdWrapper: new FundValueCalculatorUsdWrapper(fixture.FundValueCalculatorUsdWrapper.address, deployer),
    gasRelayPaymasterFactory: new GasRelayPaymasterFactory(fixture.GasRelayPaymasterFactory.address, deployer),
    gatedRedemptionQueueSharesWrapperFactory: new GatedRedemptionQueueSharesWrapperFactory(fixture.GatedRedemptionQueueSharesWrapperFactory.address, deployer),
    gatedRedemptionQueueSharesWrapperLib: new GatedRedemptionQueueSharesWrapperLib(fixture.GatedRedemptionQueueSharesWrapperLib.address, deployer),
    globalConfigLib: new GlobalConfigLib(fixture.GlobalConfigLib.address, deployer),
    globalConfigProxy: new GlobalConfigLib(fixture.GlobalConfigProxy.address, deployer),
    idleAdapter: new IdleAdapter(fixture.IdleAdapter.address, deployer),
    idlePriceFeed: new IdlePriceFeed(fixture.IdlePriceFeed.address, deployer),
    integrationManager: new IntegrationManager(fixture.IntegrationManager.address, deployer),
    kilnStakingPositionLib: new KilnStakingPositionLib(fixture.KilnStakingPositionLib.address, deployer),
    KilnStakingPositionParser: new KilnStakingPositionParser(fixture.KilnStakingPositionParser.address, deployer),
    liquityDebtPositionLib: new LiquityDebtPositionLib(fixture.LiquityDebtPositionLib.address, deployer),
    liquityDebtPositionParser: new LiquityDebtPositionParser(fixture.LiquityDebtPositionParser.address, deployer),
    managementFee: new ManagementFee(fixture.ManagementFee.address, deployer),
    manualValueOracleFactory: new ManualValueOracleFactory(fixture.ManualValueOracleFactory.address, deployer),
    mapleLiquidityPositionLib: new MapleLiquidityPositionLib(fixture.MapleLiquidityPositionLib.address, deployer),
    mapleLiquidityPositionParser: new MapleLiquidityPositionParser(fixture.MapleLiquidityPositionParser.address, deployer),
    mapleV1ToV2PoolMapper: new MapleV1ToV2PoolMapper(fixture.MapleV1ToV2PoolMapper.address, deployer),
    minAssetBalancesPostRedemptionPolicy: new MinAssetBalancesPostRedemptionPolicy(fixture.MinAssetBalancesPostRedemptionPolicy.address, deployer),
    minMaxInvestmentPolicy: new MinMaxInvestmentPolicy(fixture.MinMaxInvestmentPolicy.address, deployer),
    notionalV2Position: new NotionalV2PositionLib(fixture.NotionalV2PositionLib.address, deployer),
    notionalV2PositionParser: new NotionalV2PositionParser(fixture.NotionalV2PositionParser.address, deployer),
    minSharesSupplyFee: new MinSharesSupplyFee(fixture.MinSharesSupplyFee.address, deployer),
    olympusV2Adapter: new OlympusV2Adapter(fixture.OlympusV2Adapter.address, deployer),
    onlyRemoveDustExternalPositionPolicy: new OnlyRemoveDustExternalPositionPolicy(fixture.OnlyRemoveDustExternalPositionPolicy.address, deployer),
    onlyUntrackDustOrPricelessAssetsPolicy: new OnlyUntrackDustOrPricelessAssetsPolicy(fixture.OnlyUntrackDustOrPricelessAssetsPolicy.address, deployer),
    paraSwapV5Adapter: new ParaSwapV5Adapter(fixture.ParaSwapV5Adapter.address, deployer),
    performanceFee: new PerformanceFee(fixture.PerformanceFee.address, deployer),
    policyManager: new PolicyManager(fixture.PolicyManager.address, deployer),
    poolTogetherV4Adapter: new PoolTogetherV4Adapter(fixture.PoolTogetherV4Adapter.address, deployer),
    poolTogetherV4PriceFeed: new PoolTogetherV4PriceFeed(fixture.PoolTogetherV4PriceFeed.address, deployer),
    protocolFeeReserveLib: new ProtocolFeeReserveLib(fixture.ProtocolFeeReserveLib.address, deployer),
    protocolFeeReserveProxy: new ProtocolFeeReserveLib(fixture.ProtocolFeeReserveProxy.address, deployer),
    protocolFeeTracker: new ProtocolFeeTracker(fixture.ProtocolFeeTracker.address, deployer),
    revertingPriceFeed: new RevertingPriceFeed(fixture.RevertingPriceFeed.address, deployer),
    sharesSplitterFactory: new SharesSplitterFactory(fixture.SharesSplitterFactory.address, deployer),
    synthetixAdapter: new SynthetixAdapter(fixture.SynthetixAdapter.address, deployer),
    uintListRegistry: new UintListRegistry(fixture.UintListRegistry.address, deployer),
    uniswapV2ExchangeAdapter: new UniswapV2ExchangeAdapter(fixture.UniswapV2ExchangeAdapter.address, deployer),
    uniswapV2LiquidityAdapter: new UniswapV2LiquidityAdapter(fixture.UniswapV2LiquidityAdapter.address, deployer),
    uniswapV2PoolPriceFeed: new UniswapV2PoolPriceFeed(fixture.UniswapV2PoolPriceFeed.address, deployer),
    uniswapV3Adapter: new UniswapV3Adapter(fixture.UniswapV3Adapter.address, deployer),
    unpermissionedActionsWrapper: new UnpermissionedActionsWrapper(fixture.UnpermissionedActionsWrapper.address, deployer),
    usdEthSimulatedAggregator: new UsdEthSimulatedAggregator(fixture.UsdEthSimulatedAggregator.address, deployer),
    valueInterpreter: new ValueInterpreter(fixture.ValueInterpreter.address, deployer),
    vaultLib: new VaultLib(fixture.VaultLib.address, deployer),
    wstethPriceFeed: new WstethPriceFeed(fixture.WstethPriceFeed.address, deployer),
    yearnVaultV2Adapter: new YearnVaultV2Adapter(fixture.YearnVaultV2Adapter.address, deployer),
    yearnVaultV2PriceFeed: new YearnVaultV2PriceFeed(fixture.YearnVaultV2PriceFeed.address, deployer),
    zeroExV2Adapter: new ZeroExV2Adapter(fixture.ZeroExV2Adapter.address, deployer),
  } as const;

  return {
    accounts,
    config,
    deployer,
    deployment,
    fixture,
  } as const;
}

type Resolve<T extends () => any> = ReturnType<T> extends Promise<infer U> ? U : ReturnType<T>;

export type ProtocolDeployment = Resolve<typeof deployProtocolFixture>;

import type { ChainlinkRateAsset } from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';

export interface DeploymentConfig {
  aaveV2: {
    incentivesController: string;
    lendingPool: string;
    lendingPoolAddressProvider: string;
    protocolDataProvider: string;
    atokens: Record<string, string>;
  };
  aaveV3: {
    pool: string;
    poolAddressProvider: string;
    referralCode: number;
    atokens: Record<string, string>;
  };
  aura: {
    booster: string;
    auraToken: string;
  };
  balancer: {
    balToken: string;
    helpers: string;
    minter: string;
    vault: string;
    poolsWeighted: {
      poolFactories: string[];
      pools: Record<
        string,
        {
          id: string;
          gauge: string;
        }
      >;
    };
    poolsStable: {
      poolFactories: string[];
      pools: Record<
        string,
        {
          id: string;
          gauge: string;
          invariantProxyAsset: string;
        }
      >;
    };
  };
  chainlink: {
    ethusd: string;
    aggregators: Record<string, readonly [string, ChainlinkRateAsset]>;
  };
  compoundV2: {
    ceth: string;
    comptroller: string;
    ctokens: Record<string, string>;
  };
  compoundV3: {
    configuratorProxy: string;
    rewards: string;
    ctokens: Record<string, string>;
  };
  convex: {
    booster: string;
    crvToken: string;
    cvxCrvStaking: string;
    cvxToken: string;
    vlCvx: string;
    vlCvxExtraRewards: string;
    votiumMultiMerkleStash: string;
  };
  curve: {
    addressProvider: string;
    minter: string;
    nativeAssetAddress: string;
    poolOwner: string;
    pools: Record<
      string,
      {
        pool: string;
        lpToken: string;
        liquidityGaugeToken: string;
        invariantProxyAsset: string;
        hasReentrantVirtualPrice: boolean;
      }
    >;
    virtualPriceDeviationThreshold: number;
  };
  feeBps: number;
  feeToken: string;
  feeTokenBurn: {
    burnFromVault: boolean;
    sendToProtocolFeeReserve: boolean;
    externalBurnerAddress: string;
  };
  goldfinch: {
    fidu: string;
    seniorPool: string;
  };
  gsn: {
    depositCooldown: number;
    depositMaxTotal: BigNumberish;
    relayFeeMaxBase: BigNumberish;
    relayFeeMaxPercent: number;
    relayHub: string;
    relayWorker: string;
    trustedForwarder: string;
  };
  idle: {
    bestYieldIdleDai: string;
    bestYieldIdleUsdc: string;
    bestYieldIdleUsdt: string;
    bestYieldIdleSusd: string;
    bestYieldIdleWbtc: string;
    riskAdjustedIdleDai: string;
    riskAdjustedIdleUsdc: string;
    riskAdjustedIdleUsdt: string;
  };
  kiln: {
    stakingContract: string;
  };
  lido: {
    steth: string;
    wsteth: string;
  };
  liquity: {
    borrowerOperations: string;
    troveManager: string;
  };
  maple: {
    mplRewardsV1Factory: string;
    v2Globals: string;
    pools: Record<string, { poolV1?: string; poolV2?: string }>;
  };
  notional: {
    notionalContract: string;
  };
  olympusV2: {
    stakingContract: string;
  };
  paraSwapV5: {
    augustusSwapper: string;
    tokenTransferProxy: string;
    feePartner: string;
    feePercent: number;
  };
  poolTogetherV4: {
    ptTokens: Record<string, [string, string]>;
  };
  positionsLimit: number;
  primitives: Record<string, string>;
  snapshot: {
    delegateRegistry: string;
  };
  solvFinanceV2: {
    bonds: {
      initialOfferingMarket: string;
      manualPriceOracle: string;
      priceOracleManager: string;
      vouchers: Record<'bviUsdWeth' | 'bviZiBit', { underlying: string; voucher: string; pool: string }>;
    };
    convertibles: {
      initialOfferingMarket: string;
      manualPriceOracle: string;
      market: string;
      priceOracleManager: string;
      vouchers: Record<'perp' | 'usf', { underlying: string; voucher: string; pool: string }>;
    };
    deployer: string;
  };
  synthetix: {
    snx: string;
    susd: string;
    delegateApprovals: string;
    originator: string;
    redeemer: string;
    trackingCode: string;
  };
  theGraph: {
    stakingProxy: string;
    grt: string;
  };
  uniswap: {
    factory: string;
    router: string;
    pools: Record<string, string>;
  };
  uniswapV3: {
    router: string;
    nonFungiblePositionManager: string;
  };
  unsupportedAssets: Record<string, string>;
  weth: string;
  wrappedNativeAsset: string;
  yearn: {
    vaultV2: {
      registry: string;
      yVaults: Record<string, string>;
    };
  };
  zeroex: {
    exchange: string;
    allowedMakers: string[];
  };
}
