import { Contract } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  Dispatcher,
  VaultLib,
  FundDeployer,
  PolicyManager,
  AavePriceFeed,
  AlphaHomoraV1PriceFeed,
  ChaiPriceFeed,
  ChainlinkPriceFeed,
  CompoundPriceFeed,
  CurvePriceFeed,
  LidoStethPriceFeed,
  StakehoundEthPriceFeed,
  SynthetixPriceFeed,
  WdgldPriceFeed,
  AggregatedDerivativePriceFeed,
  ValueInterpreter,
  UniswapV2PoolPriceFeed,
  IntegrationManager,
  CurveLiquidityStethAdapter,
  AaveAdapter,
  AlphaHomoraV1Adapter,
  ParaSwapAdapter,
  SynthetixAdapter,
  ZeroExV2Adapter,
  CompoundAdapter,
  UniswapV2Adapter,
  TrackedAssetsAdapter,
  ChaiAdapter,
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

import { DeploymentConfig } from '../../../../../deploy/utils/config';

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
    Dispatcher: new Dispatcher(fixture['Dispatcher'].address, deployer),
    VaultLib: new VaultLib(fixture['VaultLib'].address, deployer),
    FundDeployer: new FundDeployer(fixture['FundDeployer'].address, deployer),
    PolicyManager: new PolicyManager(fixture['PolicyManager'].address, deployer),
    AavePriceFeed: new AavePriceFeed(fixture['AavePriceFeed'].address, deployer),
    AlphaHomoraV1PriceFeed: new AlphaHomoraV1PriceFeed(fixture['AlphaHomoraV1PriceFeed'].address, deployer),
    ChaiPriceFeed: new ChaiPriceFeed(fixture['ChaiPriceFeed'].address, deployer),
    ChainlinkPriceFeed: new ChainlinkPriceFeed(fixture['ChainlinkPriceFeed'].address, deployer),
    CompoundPriceFeed: new CompoundPriceFeed(fixture['CompoundPriceFeed'].address, deployer),
    CurvePriceFeed: new CurvePriceFeed(fixture['CurvePriceFeed'].address, deployer),
    LidoStethPriceFeed: new LidoStethPriceFeed(fixture['LidoStethPriceFeed'].address, deployer),
    SynthetixPriceFeed: new SynthetixPriceFeed(fixture['SynthetixPriceFeed'].address, deployer),
    StakehoundEthPriceFeed: new StakehoundEthPriceFeed(fixture['StakehoundEthPriceFeed'].address, deployer),
    WdgldPriceFeed: new WdgldPriceFeed(fixture['WdgldPriceFeed'].address, deployer),
    AggregatedDerivativePriceFeed: new AggregatedDerivativePriceFeed(fixture['AggregatedDerivativePriceFeed'].address, deployer),
    ValueInterpreter: new ValueInterpreter(fixture['ValueInterpreter'].address, deployer),
    UniswapV2PoolPriceFeed: new UniswapV2PoolPriceFeed(fixture['UniswapV2PoolPriceFeed'].address, deployer),
    IntegrationManager: new IntegrationManager(fixture['IntegrationManager'].address, deployer),
    CurveLiquidityStethAdapter: new CurveLiquidityStethAdapter(fixture['CurveLiquidityStethAdapter'].address, deployer),
    AaveAdapter: new AaveAdapter(fixture['AaveAdapter'].address, deployer),
    AlphaHomoraV1Adapter: new AlphaHomoraV1Adapter(fixture['AlphaHomoraV1Adapter'].address, deployer),
    ParaSwapAdapter: new ParaSwapAdapter(fixture['ParaSwapAdapter'].address, deployer),
    SynthetixAdapter: new SynthetixAdapter(fixture['SynthetixAdapter'].address, deployer),
    ZeroExV2Adapter: new ZeroExV2Adapter(fixture['ZeroExV2Adapter'].address, deployer),
    CompoundAdapter: new CompoundAdapter(fixture['CompoundAdapter'].address, deployer),
    UniswapV2Adapter: new UniswapV2Adapter(fixture['UniswapV2Adapter'].address, deployer),
    TrackedAssetsAdapter: new TrackedAssetsAdapter(fixture['TrackedAssetsAdapter'].address, deployer),
    ChaiAdapter: new ChaiAdapter(fixture['ChaiAdapter'].address, deployer),
    CurveExchangeAdapter: new CurveExchangeAdapter(fixture['CurveExchangeAdapter'].address, deployer),
    KyberAdapter: new KyberAdapter(fixture['KyberAdapter'].address, deployer),
    FeeManager: new FeeManager(fixture['FeeManager'].address, deployer),
    ComptrollerLib: new ComptrollerLib(fixture['ComptrollerLib'].address, deployer),
    EntranceRateBurnFee: new EntranceRateBurnFee(fixture['EntranceRateBurnFee'].address, deployer),
    EntranceRateDirectFee: new EntranceRateDirectFee(fixture['EntranceRateDirectFee'].address, deployer),
    ManagementFee: new ManagementFee(fixture['ManagementFee'].address, deployer),
    PerformanceFee: new PerformanceFee(fixture['PerformanceFee'].address, deployer),
    AuthUserExecutedSharesRequestorLib: new AuthUserExecutedSharesRequestorLib(fixture['AuthUserExecutedSharesRequestorLib'].address, deployer),
    AuthUserExecutedSharesRequestorFactory: new AuthUserExecutedSharesRequestorFactory(fixture['AuthUserExecutedSharesRequestorFactory'].address, deployer),
    FundActionsWrapper: new FundActionsWrapper(fixture['FundActionsWrapper'].address, deployer),
    AdapterBlacklist: new AdapterBlacklist(fixture['AdapterBlacklist'].address, deployer),
    AdapterWhitelist: new AdapterWhitelist(fixture['AdapterWhitelist'].address, deployer),
    AssetBlacklist: new AssetBlacklist(fixture['AssetBlacklist'].address, deployer),
    AssetWhitelist: new AssetWhitelist(fixture['AssetWhitelist'].address, deployer),
    BuySharesCallerWhitelist: new BuySharesCallerWhitelist(fixture['BuySharesCallerWhitelist'].address, deployer),
    MaxConcentration: new MaxConcentration(fixture['MaxConcentration'].address, deployer),
    MinMaxInvestment: new MinMaxInvestment(fixture['MinMaxInvestment'].address, deployer),
    InvestorWhitelist: new InvestorWhitelist(fixture['InvestorWhitelist'].address, deployer),
    GuaranteedRedemption: new GuaranteedRedemption(fixture['GuaranteedRedemption'].address, deployer),
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
