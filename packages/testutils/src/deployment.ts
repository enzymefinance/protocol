import {
  AaveAdapter,
  AavePriceFeed,
  AddressListRegistry,
  AllowedAdapterIncomingAssetsPolicy,
  AllowedAdaptersPolicy,
  AllowedAssetsForRedemptionPolicy,
  AllowedDepositRecipientsPolicy,
  AllowedExternalPositionTypesPolicy,
  AllowedSharesTransferRecipientsPolicy,
  AssetFinalityResolver,
  CompoundAdapter,
  CompoundDebtPositionLib,
  CompoundDebtPositionParser,
  CompoundPriceFeed,
  ComptrollerLib,
  CumulativeSlippageTolerancePolicy,
  CurveExchangeAdapter,
  CurveLiquidityAaveAdapter,
  CurveLiquidityAdapter,
  CurveLiquidityEursAdapter,
  CurveLiquiditySethAdapter,
  CurveLiquidityStethAdapter,
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
  FundDeployer,
  FundValueCalculator,
  FundValueCalculatorRouter,
  FundValueCalculatorUsdWrapper,
  GasRelayPaymasterFactory,
  GuaranteedRedemptionPolicy,
  IdleAdapter,
  IdlePriceFeed,
  IntegrationManager,
  LidoStethPriceFeed,
  ManagementFee,
  MinAssetBalancesPostRedemptionPolicy,
  MinMaxInvestmentPolicy,
  OlympusV2Adapter,
  OnlyRemoveDustExternalPositionPolicy,
  OnlyUntrackDustOrPricelessAssetsPolicy,
  ParaSwapV4Adapter,
  ParaSwapV5Adapter,
  PerformanceFee,
  PolicyManager,
  PoolTogetherV4Adapter,
  PoolTogetherV4PriceFeed,
  ProtocolFeeReserveLib,
  ProtocolFeeTracker,
  RevertingPriceFeed,
  StakehoundEthPriceFeed,
  SynthetixAdapter,
  SynthetixPriceFeed,
  UniswapV2ExchangeAdapter,
  UniswapV2LiquidityAdapter,
  UniswapV2PoolPriceFeed,
  UniswapV3Adapter,
  UnpermissionedActionsWrapper,
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
  const config = fixture['Config'].linkedData as DeploymentConfig;

  // prettier-ignore
  const deployment = {
    aaveAdapter: new AaveAdapter(fixture['AaveAdapter'].address, deployer),
    aavePriceFeed: new AavePriceFeed(fixture['AavePriceFeed'].address, deployer),
    addressListRegistry: new AddressListRegistry(fixture['AddressListRegistry'].address, deployer),
    allowedAdapterIncomingAssetsPolicy: new AllowedAdapterIncomingAssetsPolicy(fixture['AllowedAdapterIncomingAssetsPolicy'].address, deployer),
    allowedAdaptersPolicy: new AllowedAdaptersPolicy(fixture['AllowedAdaptersPolicy'].address, deployer),
    allowedAssetsForRedemptionPolicy: new AllowedAssetsForRedemptionPolicy(fixture['AllowedAssetsForRedemptionPolicy'].address, deployer),
    allowedDepositRecipientsPolicy: new AllowedDepositRecipientsPolicy(fixture['AllowedDepositRecipientsPolicy'].address, deployer),
    allowedExternalPositionTypesPolicy: new AllowedExternalPositionTypesPolicy(fixture['AllowedExternalPositionTypesPolicy'].address, deployer),
    allowedSharesTransferRecipientsPolicy: new AllowedSharesTransferRecipientsPolicy(fixture['AllowedSharesTransferRecipientsPolicy'].address, deployer),
    assetFinalityResolver: new AssetFinalityResolver(fixture['AssetFinalityResolver'].address, deployer),
    compoundAdapter: new CompoundAdapter(fixture['CompoundAdapter'].address, deployer),
    compoundDebtPositionLib: new CompoundDebtPositionLib(fixture['CompoundDebtPositionLib'].address, deployer),
    compoundDebtPositionParser: new CompoundDebtPositionParser(fixture['CompoundDebtPositionParser'].address, deployer),
    compoundPriceFeed: new CompoundPriceFeed(fixture['CompoundPriceFeed'].address, deployer),
    comptrollerLib: new ComptrollerLib(fixture['ComptrollerLib'].address, deployer),
    cumulativeSlippageTolerancePolicy: new CumulativeSlippageTolerancePolicy(fixture['CumulativeSlippageTolerancePolicy'].address, deployer),
    curveExchangeAdapter: new CurveExchangeAdapter(fixture['CurveExchangeAdapter'].address, deployer),
    curveLiquidityAaveAdapter: new CurveLiquidityAaveAdapter(fixture['CurveLiquidityAaveAdapter'].address, deployer),
    curveLiquidityAdapter: new CurveLiquidityAdapter(fixture['CurveLiquidityAdapter'].address, deployer),
    curveLiquidityEursAdapter: new CurveLiquidityEursAdapter(fixture['CurveLiquidityEursAdapter'].address, deployer),
    curveLiquiditySethAdapter: new CurveLiquiditySethAdapter(fixture['CurveLiquiditySethAdapter'].address, deployer),
    curveLiquidityStethAdapter: new CurveLiquidityStethAdapter(fixture['CurveLiquidityStethAdapter'].address, deployer),
    curvePriceFeed: new CurvePriceFeed(fixture['CurvePriceFeed'].address, deployer),
    depositWrapper: new DepositWrapper(fixture['DepositWrapper'].address, deployer),
    dispatcher: new Dispatcher(fixture['Dispatcher'].address, deployer),
    entranceRateBurnFee: new EntranceRateBurnFee(fixture['EntranceRateBurnFee'].address, deployer),
    entranceRateDirectFee: new EntranceRateDirectFee(fixture['EntranceRateDirectFee'].address, deployer),
    exitRateBurnFee: new ExitRateBurnFee(fixture['ExitRateBurnFee'].address, deployer),
    exitRateDirectFee: new ExitRateDirectFee(fixture['ExitRateDirectFee'].address, deployer),
    externalPositionFactory: new ExternalPositionFactory(fixture['ExternalPositionFactory'].address, deployer),
    externalPositionManager: new ExternalPositionManager(fixture['ExternalPositionManager'].address, deployer),
    feeManager: new FeeManager(fixture['FeeManager'].address, deployer),
    fundDeployer: new FundDeployer(fixture['FundDeployer'].address, deployer),
    fundValueCalculator: new FundValueCalculator(fixture['FundValueCalculator'].address, deployer),
    fundValueCalculatorRouter: new FundValueCalculatorRouter(fixture['FundValueCalculatorRouter'].address, deployer),
    fundValueCalculatorUsdWrapper: new FundValueCalculatorUsdWrapper(fixture['FundValueCalculatorUsdWrapper'].address, deployer),
    gasRelayPaymasterFactory: new GasRelayPaymasterFactory(fixture['GasRelayPaymasterFactory'].address, deployer),
    guaranteedRedemptionPolicy: new GuaranteedRedemptionPolicy(fixture['GuaranteedRedemptionPolicy'].address, deployer),
    idleAdapter: new IdleAdapter(fixture['IdleAdapter'].address, deployer),
    idlePriceFeed: new IdlePriceFeed(fixture['IdlePriceFeed'].address, deployer),
    integrationManager: new IntegrationManager(fixture['IntegrationManager'].address, deployer),
    lidoStethPriceFeed: new LidoStethPriceFeed(fixture['LidoStethPriceFeed'].address, deployer),
    managementFee: new ManagementFee(fixture['ManagementFee'].address, deployer),
    minAssetBalancesPostRedemptionPolicy: new MinAssetBalancesPostRedemptionPolicy(fixture['MinAssetBalancesPostRedemptionPolicy'].address, deployer),
    minMaxInvestmentPolicy: new MinMaxInvestmentPolicy(fixture['MinMaxInvestmentPolicy'].address, deployer),
    olympusV2Adapter: new OlympusV2Adapter(fixture['OlympusV2Adapter'].address, deployer),
    onlyRemoveDustExternalPositionPolicy: new OnlyRemoveDustExternalPositionPolicy(fixture['OnlyRemoveDustExternalPositionPolicy'].address, deployer),
    onlyUntrackDustOrPricelessAssetsPolicy: new OnlyUntrackDustOrPricelessAssetsPolicy(fixture['OnlyUntrackDustOrPricelessAssetsPolicy'].address, deployer),
    paraSwapV4Adapter: new ParaSwapV4Adapter(fixture['ParaSwapV4Adapter'].address, deployer),
    paraSwapV5Adapter: new ParaSwapV5Adapter(fixture['ParaSwapV5Adapter'].address, deployer),
    performanceFee: new PerformanceFee(fixture['PerformanceFee'].address, deployer),
    policyManager: new PolicyManager(fixture['PolicyManager'].address, deployer),
    poolTogetherV4Adapter: new PoolTogetherV4Adapter(fixture['PoolTogetherV4Adapter'].address, deployer),
    poolTogetherV4PriceFeed: new PoolTogetherV4PriceFeed(fixture['PoolTogetherV4PriceFeed'].address, deployer),
    protocolFeeReserveLib: new ProtocolFeeReserveLib(fixture['ProtocolFeeReserveLib'].address, deployer),
    protocolFeeReserveProxy: new ProtocolFeeReserveLib(fixture['ProtocolFeeReserveProxy'].address, deployer),
    protocolFeeTracker: new ProtocolFeeTracker(fixture['ProtocolFeeTracker'].address, deployer),
    revertingPriceFeed: new RevertingPriceFeed(fixture['RevertingPriceFeed'].address, deployer),
    stakehoundEthPriceFeed: new StakehoundEthPriceFeed(fixture['StakehoundEthPriceFeed'].address, deployer),
    synthetixAdapter: new SynthetixAdapter(fixture['SynthetixAdapter'].address, deployer),
    synthetixPriceFeed: new SynthetixPriceFeed(fixture['SynthetixPriceFeed'].address, deployer),
    uniswapV2ExchangeAdapter: new UniswapV2ExchangeAdapter(fixture['UniswapV2ExchangeAdapter'].address, deployer),
    uniswapV2LiquidityAdapter: new UniswapV2LiquidityAdapter(fixture['UniswapV2LiquidityAdapter'].address, deployer),
    uniswapV2PoolPriceFeed: new UniswapV2PoolPriceFeed(fixture['UniswapV2PoolPriceFeed'].address, deployer),
    uniswapV3Adapter: new UniswapV3Adapter(fixture['UniswapV3Adapter'].address, deployer),
    unpermissionedActionsWrapper: new UnpermissionedActionsWrapper(fixture['UnpermissionedActionsWrapper'].address, deployer),
    valueInterpreter: new ValueInterpreter(fixture['ValueInterpreter'].address, deployer),
    vaultLib: new VaultLib(fixture['VaultLib'].address, deployer),
    yearnVaultV2Adapter: new YearnVaultV2Adapter(fixture['YearnVaultV2Adapter'].address, deployer),
    yearnVaultV2PriceFeed: new YearnVaultV2PriceFeed(fixture['YearnVaultV2PriceFeed'].address, deployer),
    zeroExV2Adapter: new ZeroExV2Adapter(fixture['ZeroExV2Adapter'].address, deployer),
  } as const;

  return {
    accounts,
    config,
    deployer,
    deployment,
  } as const;
}

type Resolve<T extends () => any> = ReturnType<T> extends Promise<infer U> ? U : ReturnType<T>;

export type ProtocolDeployment = Resolve<typeof deployProtocolFixture>;

import type { ChainlinkRateAsset } from '@enzymefinance/protocol';

export interface DeploymentConfig {
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
  chainlink: {
    ethusd: string;
    aggregators: Record<string, readonly [string, ChainlinkRateAsset]>;
  };
  synthetix: {
    snx: string;
    susd: string;
    synths: Record<string, string>;
    addressResolver: string;
    delegateApprovals: string;
    originator: string;
    redeemer: string;
    trackingCode: string;
  };
  curve: {
    addressProvider: string;
    minter: string;
    pools: Record<string, { pool: string; lpToken: string; liquidityGaugeToken: string; invariantProxyAsset: string }>;
  };
  aave: {
    lendingPoolAddressProvider: string;
    protocolDataProvider: string;
    atokens: Record<string, [string, string]>;
  };
  compound: {
    ceth: string;
    comptroller: string;
    ctokens: Record<string, string>;
  };
  idle: {
    bestYieldIdleDai: string;
    bestYieldIdleUsdc: string;
    bestYieldIdleUsdt: string;
    bestYieldIdleSusd: string;
    bestYieldIdleTusd: string;
    bestYieldIdleWbtc: string;
    riskAdjustedIdleDai: string;
    riskAdjustedIdleUsdc: string;
    riskAdjustedIdleUsdt: string;
  };
  lido: {
    steth: string;
  };
  olympusV2: {
    stakingContract: string;
  };
  paraSwapV4: {
    augustusSwapper: string;
    tokenTransferProxy: string;
  };
  paraSwapV5: {
    augustusSwapper: string;
    tokenTransferProxy: string;
  };
  poolTogetherV4: {
    ptTokens: Record<string, [string, string]>;
  };
  positionsLimit: number;
  stakehound: {
    steth: string;
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
  policies: {
    guaranteedRedemption: {
      redemptionWindowBuffer: number;
    };
  };
}
