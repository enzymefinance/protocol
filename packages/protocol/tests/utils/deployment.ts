import {
  AaveAdapter,
  AaveDebtPositionLib,
  AaveDebtPositionParser,
  AavePriceFeed,
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
  BalancerV2LiquidityAdapter,
  BalancerV2StablePoolPriceFeed,
  BalancerV2WeightedPoolPriceFeed,
  CompoundAdapter,
  CompoundDebtPositionLib,
  CompoundDebtPositionParser,
  CompoundPriceFeed,
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
  GlobalConfigLib,
  IdleAdapter,
  IdlePriceFeed,
  IntegrationManager,
  KilnStakingPositionLib,
  KilnStakingPositionParser,
  LidoStethPriceFeed,
  LiquityDebtPositionLib,
  LiquityDebtPositionParser,
  ManagementFee,
  ManualValueOracleFactory,
  MapleLiquidityPositionLib,
  MapleLiquidityPositionParser,
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
    aaveAdapter: new AaveAdapter(fixture.AaveAdapter.address, deployer),
    aaveDebtPositionLib: new AaveDebtPositionLib(fixture.AaveDebtPositionLib.address, deployer),
    aaveDebtPositionParser: new AaveDebtPositionParser(fixture.AaveDebtPositionParser.address, deployer),
    aavePriceFeed: new AavePriceFeed(fixture.AavePriceFeed.address, deployer),
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
    balancerV2LiquidityAdapter: new BalancerV2LiquidityAdapter(fixture.BalancerV2LiquidityAdapter, deployer),
    balancerV2StablePoolPriceFeed: new BalancerV2StablePoolPriceFeed(fixture.BalancerV2StablePoolPriceFeed, deployer),
    balancerV2WeightedPoolPriceFeed: new BalancerV2WeightedPoolPriceFeed(fixture.BalancerV2WeightedPoolPriceFeed, deployer),
    compoundAdapter: new CompoundAdapter(fixture.CompoundAdapter.address, deployer),
    compoundDebtPositionLib: new CompoundDebtPositionLib(fixture.CompoundDebtPositionLib.address, deployer),
    compoundDebtPositionParser: new CompoundDebtPositionParser(fixture.CompoundDebtPositionParser.address, deployer),
    compoundPriceFeed: new CompoundPriceFeed(fixture.CompoundPriceFeed.address, deployer),
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
    globalConfigLib: new GlobalConfigLib(fixture.GlobalConfigLib.address, deployer),
    globalConfigProxy: new GlobalConfigLib(fixture.GlobalConfigProxy.address, deployer),
    idleAdapter: new IdleAdapter(fixture.IdleAdapter.address, deployer),
    idlePriceFeed: new IdlePriceFeed(fixture.IdlePriceFeed.address, deployer),
    integrationManager: new IntegrationManager(fixture.IntegrationManager.address, deployer),
    kilnStakingPositionLib: new KilnStakingPositionLib(fixture.KilnStakingPositionLib.address, deployer),
    KilnStakingPositionParser: new KilnStakingPositionParser(fixture.KilnStakingPositionParser.address, deployer),
    lidoStethPriceFeed: new LidoStethPriceFeed(fixture.LidoStethPriceFeed.address, deployer),
    liquityDebtPositionLib: new LiquityDebtPositionLib(fixture.LiquityDebtPositionLib.address, deployer),
    liquityDebtPositionParser: new LiquityDebtPositionParser(fixture.LiquityDebtPositionParser.address, deployer),
    managementFee: new ManagementFee(fixture.ManagementFee.address, deployer),
    manualValueOracleFactory: new ManualValueOracleFactory(fixture.ManualValueOracleFactory.address, deployer),
    mapleLiquidityPositionLib: new MapleLiquidityPositionLib(fixture.MapleLiquidityPositionLib.address, deployer),
    mapleLiquidityPositionParser: new MapleLiquidityPositionParser(fixture.MapleLiquidityPositionParser.address, deployer),
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

export interface DeploymentConfig {
  feeBps: number;
  feeToken: string;
  feeTokenBurn: {
    burnFromVault: boolean;
    sendToProtocolFeeReserve: boolean;
    externalBurnerAddress: string;
  };
  weth: string;
  wrappedNativeAsset: string;
  primitives: Record<string, string>;
  gsn: {
    relayHub: string;
    relayWorker: string;
    trustedForwarder: string;
  };
  balancer: {
    vault: string;
    helpers: string;
    poolsWeighted: {
      poolFactories: string[];
      pools: Record<
        string,
        {
          id: string;
        }
      >;
    };
    poolsStable: {
      poolFactories: string[];
      pools: Record<
        string,
        {
          id: string;
          invariantProxyAsset: string;
        }
      >;
    };
  };
  chainlink: {
    ethusd: string;
    aggregators: Record<string, readonly [string, ChainlinkRateAsset]>;
  };
  synthetix: {
    snx: string;
    susd: string;
    delegateApprovals: string;
    originator: string;
    redeemer: string;
    trackingCode: string;
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
  aave: {
    incentivesController: string;
    lendingPoolAddressProvider: string;
    protocolDataProvider: string;
    atokens: Record<string, [string, string]>;
  };
  compound: {
    ceth: string;
    comptroller: string;
    ctokens: Record<string, string>;
  };
  goldfinch: {
    fidu: string;
    seniorPool: string;
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
  };
  liquity: {
    borrowerOperations: string;
    troveManager: string;
  };
  maple: {
    mplRewardsFactory: string;
    poolFactory: string;
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
  snapshot: {
    delegateRegistry: string;
  };
  solvFinanceV2: {
    convertibleMarket: string;
    initialConvertibleOfferingMarket: string;
    deployer: string;
    priceOracleManager: string;
    manualPriceOracle: string;
    convertibles: Record<'perp' | 'usf', { underlying: string; voucher: string; pool: string }>;
  };
  theGraph: {
    stakingProxy: string;
    grt: string;
  };
  unsupportedAssets: Record<string, string>;
  uniswap: {
    factory: string;
    router: string;
    pools: Record<string, string>;
  };
  uniswapV3: {
    router: string;
    nonFungiblePositionManager: string;
  };
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
