import { Contract } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  Dispatcher,
  VaultLib,
  FundDeployer,
  PolicyManager,
  AavePriceFeed,
  AlphaHomoraV1PriceFeed,
  ChainlinkPriceFeed,
  CompoundPriceFeed,
  CurvePriceFeed,
  IdlePriceFeed,
  LidoStethPriceFeed,
  RevertingPriceFeed,
  StakehoundEthPriceFeed,
  SynthetixPriceFeed,
  WdgldPriceFeed,
  YearnVaultV2PriceFeed,
  AggregatedDerivativePriceFeed,
  ValueInterpreter,
  UniswapV2PoolPriceFeed,
  IntegrationManager,
  AaveAdapter,
  AlphaHomoraV1Adapter,
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
  UniswapV2Adapter,
  TrackedAssetsAdapter,
  UniswapV3Adapter,
  CurveExchangeAdapter,
  KyberAdapter,
  FeeManager,
  ComptrollerLib,
  EntranceRateBurnFee,
  EntranceRateDirectFee,
  ManagementFee,
  PerformanceFee,
  AuthUserExecutedSharesRequestorLib,
  AuthUserExecutedSharesRequestorFactory,
  FundActionsWrapper,
  AdapterBlacklist,
  AdapterWhitelist,
  AssetBlacklist,
  AssetWhitelist,
  BuySharesCallerWhitelist,
  MaxConcentration,
  MinMaxInvestment,
  InvestorWhitelist,
  GuaranteedRedemption,
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
    alphaHomoraV1PriceFeed: new AlphaHomoraV1PriceFeed(fixture['AlphaHomoraV1PriceFeed'].address, deployer),
    chainlinkPriceFeed: new ChainlinkPriceFeed(fixture['ChainlinkPriceFeed'].address, deployer),
    compoundPriceFeed: new CompoundPriceFeed(fixture['CompoundPriceFeed'].address, deployer),
    curvePriceFeed: new CurvePriceFeed(fixture['CurvePriceFeed'].address, deployer),
    idlePriceFeed: new IdlePriceFeed(fixture['IdlePriceFeed'].address, deployer),
    lidoStethPriceFeed: new LidoStethPriceFeed(fixture['LidoStethPriceFeed'].address, deployer),
    revertingPriceFeed: new RevertingPriceFeed(fixture['RevertingPriceFeed'].address, deployer),
    synthetixPriceFeed: new SynthetixPriceFeed(fixture['SynthetixPriceFeed'].address, deployer),
    stakehoundEthPriceFeed: new StakehoundEthPriceFeed(fixture['StakehoundEthPriceFeed'].address, deployer),
    wdgldPriceFeed: new WdgldPriceFeed(fixture['WdgldPriceFeed'].address, deployer),
    yearnVaultV2PriceFeed: new YearnVaultV2PriceFeed(fixture['YearnVaultV2PriceFeed'].address, deployer),
    aggregatedDerivativePriceFeed: new AggregatedDerivativePriceFeed(fixture['AggregatedDerivativePriceFeed'].address, deployer),
    valueInterpreter: new ValueInterpreter(fixture['ValueInterpreter'].address, deployer),
    uniswapV2PoolPriceFeed: new UniswapV2PoolPriceFeed(fixture['UniswapV2PoolPriceFeed'].address, deployer),
    integrationManager: new IntegrationManager(fixture['IntegrationManager'].address, deployer),
    curveLiquidityAaveAdapter: new CurveLiquidityAaveAdapter(fixture['CurveLiquidityAaveAdapter'].address, deployer),
    curveLiquidityEursAdapter: new CurveLiquidityEursAdapter(fixture['CurveLiquidityEursAdapter'].address, deployer),
    curveLiquiditySethAdapter: new CurveLiquiditySethAdapter(fixture['CurveLiquiditySethAdapter'].address, deployer),
    curveLiquidityStethAdapter: new CurveLiquidityStethAdapter(fixture['CurveLiquidityStethAdapter'].address, deployer),
    aaveAdapter: new AaveAdapter(fixture['AaveAdapter'].address, deployer),
    alphaHomoraV1Adapter: new AlphaHomoraV1Adapter(fixture['AlphaHomoraV1Adapter'].address, deployer),
    idleAdapter: new IdleAdapter(fixture['IdleAdapter'].address, deployer),
    paraSwapV4Adapter: new ParaSwapV4Adapter(fixture['ParaSwapV4Adapter'].address, deployer),
    synthetixAdapter: new SynthetixAdapter(fixture['SynthetixAdapter'].address, deployer),
    yearnVaultV2Adapter: new YearnVaultV2Adapter(fixture['YearnVaultV2Adapter'].address, deployer),
    zeroExV2Adapter: new ZeroExV2Adapter(fixture['ZeroExV2Adapter'].address, deployer),
    compoundAdapter: new CompoundAdapter(fixture['CompoundAdapter'].address, deployer),
    uniswapV2Adapter: new UniswapV2Adapter(fixture['UniswapV2Adapter'].address, deployer),
    trackedAssetsAdapter: new TrackedAssetsAdapter(fixture['TrackedAssetsAdapter'].address, deployer),
    uniswapV3Adapter: new UniswapV3Adapter(fixture['UniswapV3Adapter'].address, deployer),
    curveExchangeAdapter: new CurveExchangeAdapter(fixture['CurveExchangeAdapter'].address, deployer),
    kyberAdapter: new KyberAdapter(fixture['KyberAdapter'].address, deployer),
    feeManager: new FeeManager(fixture['FeeManager'].address, deployer),
    comptrollerLib: new ComptrollerLib(fixture['ComptrollerLib'].address, deployer),
    entranceRateBurnFee: new EntranceRateBurnFee(fixture['EntranceRateBurnFee'].address, deployer),
    entranceRateDirectFee: new EntranceRateDirectFee(fixture['EntranceRateDirectFee'].address, deployer),
    managementFee: new ManagementFee(fixture['ManagementFee'].address, deployer),
    performanceFee: new PerformanceFee(fixture['PerformanceFee'].address, deployer),
    authUserExecutedSharesRequestorLib: new AuthUserExecutedSharesRequestorLib(fixture['AuthUserExecutedSharesRequestorLib'].address, deployer),
    authUserExecutedSharesRequestorFactory: new AuthUserExecutedSharesRequestorFactory(fixture['AuthUserExecutedSharesRequestorFactory'].address, deployer),
    fundActionsWrapper: new FundActionsWrapper(fixture['FundActionsWrapper'].address, deployer),
    adapterBlacklist: new AdapterBlacklist(fixture['AdapterBlacklist'].address, deployer),
    adapterWhitelist: new AdapterWhitelist(fixture['AdapterWhitelist'].address, deployer),
    assetBlacklist: new AssetBlacklist(fixture['AssetBlacklist'].address, deployer),
    assetWhitelist: new AssetWhitelist(fixture['AssetWhitelist'].address, deployer),
    buySharesCallerWhitelist: new BuySharesCallerWhitelist(fixture['BuySharesCallerWhitelist'].address, deployer),
    maxConcentration: new MaxConcentration(fixture['MaxConcentration'].address, deployer),
    minMaxInvestment: new MinMaxInvestment(fixture['MinMaxInvestment'].address, deployer),
    investorWhitelist: new InvestorWhitelist(fixture['InvestorWhitelist'].address, deployer),
    guaranteedRedemption: new GuaranteedRedemption(fixture['GuaranteedRedemption'].address, deployer),
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
