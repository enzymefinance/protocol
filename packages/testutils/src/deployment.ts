import { Contract } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  Dispatcher,
  VaultLib,
  FundDeployer,
  PolicyManager,
  AavePriceFeed,
  CompoundPriceFeed,
  CompoundDebtPositionLib,
  CompoundDebtPositionParser,
  CurvePriceFeed,
  IdlePriceFeed,
  LidoStethPriceFeed,
  RevertingPriceFeed,
  StakehoundEthPriceFeed,
  SynthetixPriceFeed,
  YearnVaultV2PriceFeed,
  ValueInterpreter,
  UniswapV2PoolPriceFeed,
  IntegrationManager,
  AaveAdapter,
  CurveLiquidityAaveAdapter,
  CurveLiquidityEursAdapter,
  CurveLiquiditySethAdapter,
  CurveLiquidityStethAdapter,
  IdleAdapter,
  ParaSwapV4Adapter,
  SynthetixAdapter,
  YearnVaultV2Adapter,
  ZeroExV2Adapter,
  CompoundAdapter,
  ExternalPositionManager,
  UniswapV2ExchangeAdapter,
  UniswapV2LiquidityAdapter,
  UniswapV3Adapter,
  CurveExchangeAdapter,
  FeeManager,
  ComptrollerLib,
  EntranceRateBurnFee,
  EntranceRateDirectFee,
  ExitRateBurnFee,
  ExitRateDirectFee,
  ManagementFee,
  PerformanceFee,
  DepositWrapper,
  UnpermissionedActionsWrapper,
  AllowedAdapterIncomingAssetsPolicy,
  MinMaxInvestmentPolicy,
  AllowedDepositRecipientsPolicy,
  GuaranteedRedemptionPolicy,
  AssetFinalityResolver,
  ProtocolFeeReserveLib,
  ProtocolFeeTracker,
  GasRelayPaymasterFactory,
  ExternalPositionFactory,
  AddressListRegistry,
  AllowedAdaptersPolicy,
  AllowedAssetsForRedemptionPolicy,
  AllowedExternalPositionTypesPolicy,
  AllowedSharesTransferRecipientsPolicy,
  CumulativeSlippageTolerancePolicy,
  MinAssetBalancesPostRedemptionPolicy,
  OnlyRemoveDustExternalPositionPolicy,
  OnlyUntrackDustOrPricelessAssetsPolicy,
  FundValueCalculatorRouter,
  FundValueCalculator,
} from '@enzymefinance/protocol';

import { DeploymentConfig } from '../../../deploy/utils/config';

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
    dispatcher: new Dispatcher(fixture['Dispatcher'].address, deployer),
    vaultLib: new VaultLib(fixture['VaultLib'].address, deployer),
    fundDeployer: new FundDeployer(fixture['FundDeployer'].address, deployer),
    policyManager: new PolicyManager(fixture['PolicyManager'].address, deployer),
    aavePriceFeed: new AavePriceFeed(fixture['AavePriceFeed'].address, deployer),
    compoundDebtPositionLib: new CompoundDebtPositionLib(fixture['CompoundDebtPositionLib'].address, deployer),
    compoundDebtPositionParser: new CompoundDebtPositionParser(fixture['CompoundDebtPositionParser'].address, deployer),
    compoundPriceFeed: new CompoundPriceFeed(fixture['CompoundPriceFeed'].address, deployer),
    curvePriceFeed: new CurvePriceFeed(fixture['CurvePriceFeed'].address, deployer),
    idlePriceFeed: new IdlePriceFeed(fixture['IdlePriceFeed'].address, deployer),
    lidoStethPriceFeed: new LidoStethPriceFeed(fixture['LidoStethPriceFeed'].address, deployer),
    revertingPriceFeed: new RevertingPriceFeed(fixture['RevertingPriceFeed'].address, deployer),
    synthetixPriceFeed: new SynthetixPriceFeed(fixture['SynthetixPriceFeed'].address, deployer),
    stakehoundEthPriceFeed: new StakehoundEthPriceFeed(fixture['StakehoundEthPriceFeed'].address, deployer),
    yearnVaultV2PriceFeed: new YearnVaultV2PriceFeed(fixture['YearnVaultV2PriceFeed'].address, deployer),
    valueInterpreter: new ValueInterpreter(fixture['ValueInterpreter'].address, deployer),
    uniswapV2PoolPriceFeed: new UniswapV2PoolPriceFeed(fixture['UniswapV2PoolPriceFeed'].address, deployer),
    integrationManager: new IntegrationManager(fixture['IntegrationManager'].address, deployer),
    externalPositionManager: new ExternalPositionManager(fixture['ExternalPositionManager'].address, deployer),
    externalPositionFactory: new ExternalPositionFactory(fixture['ExternalPositionFactory'].address, deployer),
    curveLiquidityAaveAdapter: new CurveLiquidityAaveAdapter(fixture['CurveLiquidityAaveAdapter'].address, deployer),
    curveLiquidityEursAdapter: new CurveLiquidityEursAdapter(fixture['CurveLiquidityEursAdapter'].address, deployer),
    curveLiquiditySethAdapter: new CurveLiquiditySethAdapter(fixture['CurveLiquiditySethAdapter'].address, deployer),
    curveLiquidityStethAdapter: new CurveLiquidityStethAdapter(fixture['CurveLiquidityStethAdapter'].address, deployer),
    aaveAdapter: new AaveAdapter(fixture['AaveAdapter'].address, deployer),
    idleAdapter: new IdleAdapter(fixture['IdleAdapter'].address, deployer),
    paraSwapV4Adapter: new ParaSwapV4Adapter(fixture['ParaSwapV4Adapter'].address, deployer),
    synthetixAdapter: new SynthetixAdapter(fixture['SynthetixAdapter'].address, deployer),
    yearnVaultV2Adapter: new YearnVaultV2Adapter(fixture['YearnVaultV2Adapter'].address, deployer),
    zeroExV2Adapter: new ZeroExV2Adapter(fixture['ZeroExV2Adapter'].address, deployer),
    compoundAdapter: new CompoundAdapter(fixture['CompoundAdapter'].address, deployer),
    uniswapV2ExchangeAdapter: new UniswapV2ExchangeAdapter(fixture['UniswapV2ExchangeAdapter'].address, deployer),
    uniswapV2LiquidityAdapter: new UniswapV2LiquidityAdapter(fixture['UniswapV2LiquidityAdapter'].address, deployer),
    uniswapV3Adapter: new UniswapV3Adapter(fixture['UniswapV3Adapter'].address, deployer),
    curveExchangeAdapter: new CurveExchangeAdapter(fixture['CurveExchangeAdapter'].address, deployer),
    feeManager: new FeeManager(fixture['FeeManager'].address, deployer),
    comptrollerLib: new ComptrollerLib(fixture['ComptrollerLib'].address, deployer),
    entranceRateBurnFee: new EntranceRateBurnFee(fixture['EntranceRateBurnFee'].address, deployer),
    entranceRateDirectFee: new EntranceRateDirectFee(fixture['EntranceRateDirectFee'].address, deployer),
    exitRateBurnFee: new ExitRateBurnFee(fixture['ExitRateBurnFee'].address, deployer),
    exitRateDirectFee: new ExitRateDirectFee(fixture['ExitRateDirectFee'].address, deployer),
    managementFee: new ManagementFee(fixture['ManagementFee'].address, deployer),
    performanceFee: new PerformanceFee(fixture['PerformanceFee'].address, deployer),
    depositWrapper: new DepositWrapper(fixture['DepositWrapper'].address, deployer),
    unpermissionedActionsWrapper: new UnpermissionedActionsWrapper(fixture['UnpermissionedActionsWrapper'].address, deployer),
    allowedAdapterIncomingAssetsPolicy: new AllowedAdapterIncomingAssetsPolicy(fixture['AllowedAdapterIncomingAssetsPolicy'].address, deployer),
    minMaxInvestmentPolicy: new MinMaxInvestmentPolicy(fixture['MinMaxInvestmentPolicy'].address, deployer),
    allowedDepositRecipientsPolicy: new AllowedDepositRecipientsPolicy(fixture['AllowedDepositRecipientsPolicy'].address, deployer),
    guaranteedRedemptionPolicy: new GuaranteedRedemptionPolicy(fixture['GuaranteedRedemptionPolicy'].address, deployer),
    assetFinalityResolver: new AssetFinalityResolver(fixture['AssetFinalityResolver'].address, deployer),
    protocolFeeReserveLib: new ProtocolFeeReserveLib(fixture['ProtocolFeeReserveLib'].address, deployer),
    protocolFeeReserveProxy: new ProtocolFeeReserveLib(fixture['ProtocolFeeReserveProxy'].address, deployer),
    protocolFeeTracker: new ProtocolFeeTracker(fixture['ProtocolFeeTracker'].address, deployer),
    gasRelayPaymasterFactory: new GasRelayPaymasterFactory(fixture['GasRelayPaymasterFactory'].address, deployer),
    addressListRegistry: new AddressListRegistry(fixture['AddressListRegistry'].address, deployer),
    allowedAdaptersPolicy: new AllowedAdaptersPolicy(fixture['AllowedAdaptersPolicy'].address, deployer),
    allowedAssetsForRedemptionPolicy: new AllowedAssetsForRedemptionPolicy(fixture['AllowedAssetsForRedemptionPolicy'].address, deployer),
    allowedExternalPositionTypesPolicy: new AllowedExternalPositionTypesPolicy(fixture['AllowedExternalPositionTypesPolicy'].address, deployer),
    allowedSharesTransferRecipientsPolicy: new AllowedSharesTransferRecipientsPolicy(fixture['AllowedSharesTransferRecipientsPolicy'].address, deployer),
    cumulativeSlippageTolerancePolicy: new CumulativeSlippageTolerancePolicy(fixture['CumulativeSlippageTolerancePolicy'].address, deployer),
    minAssetBalancesPostRedemptionPolicy: new MinAssetBalancesPostRedemptionPolicy(fixture['MinAssetBalancesPostRedemptionPolicy'].address, deployer),
    onlyRemoveDustExternalPositionPolicy: new OnlyRemoveDustExternalPositionPolicy(fixture['OnlyRemoveDustExternalPositionPolicy'].address, deployer),
    onlyUntrackDustOrPricelessAssetsPolicy: new OnlyUntrackDustOrPricelessAssetsPolicy(fixture['OnlyUntrackDustOrPricelessAssetsPolicy'].address, deployer),
    fundValueCalculatorRouter: new FundValueCalculatorRouter(fixture['FundValueCalculatorRouter'].address, deployer),
    fundValueCalculator: new FundValueCalculator(fixture['FundValueCalculator'].address, deployer),
  } as const;

  return {
    deployer,
    deployment,
    accounts,
    config,
  } as const;
}

type Resolve<T extends () => any> = ReturnType<T> extends Promise<infer U> ? U : ReturnType<T>;
type ContractMap = Record<string, Contract>;

export interface DeploymentFixtureWithoutConfig<T extends ContractMap> {
  deployer: SignerWithAddress;
  deployment: T;
  accounts: SignerWithAddress[];
}

export interface DeploymentFixtureWithConfig<T extends ContractMap> extends DeploymentFixtureWithoutConfig<T> {
  config: DeploymentConfig;
}

export type ProtocolDeployment = Resolve<typeof deployProtocolFixture>;

// TODO: Remove this.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function defaultTestDeployment(_: any): Promise<any> {
  throw new Error('Removed');
}
