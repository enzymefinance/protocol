import { SignerWithAddress } from '@crestproject/crestproject';
import {
  Dispatcher,
  VaultLib,
  FundDeployer,
  PolicyManager,
  ChaiPriceFeed,
  WdgldPriceFeed,
  ChainlinkPriceFeed,
  CompoundPriceFeed,
  StakehoundEthPriceFeed,
  SynthetixPriceFeed,
  AggregatedDerivativePriceFeed,
  ValueInterpreter,
  UniswapV2PoolPriceFeed,
  IntegrationManager,
  ParaSwapAdapter,
  SynthetixAdapter,
  ZeroExV2Adapter,
  CompoundAdapter,
  UniswapV2Adapter,
  TrackedAssetsAdapter,
  ChaiAdapter,
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
import hre from 'hardhat';
import { DeploymentConfig } from '../../../../../deploy/config/Config';

export type ForkDeployment = ReturnType<typeof loadForkDeployment> extends Promise<infer T> ? T : never;

export async function loadForkDeployment() {
  const output = await hre.deployments.fixture();
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const accounts = ((await hre.ethers.getUnnamedSigners()) as any) as SignerWithAddress[];
  const config = output['Config'].linkedData as DeploymentConfig;

  // prettier-ignore
  const deployment = {
    Dispatcher: new Dispatcher(output['Dispatcher'].address, deployer),
    VaultLib: new VaultLib(output['VaultLib'].address, deployer),
    FundDeployer: new FundDeployer(output['FundDeployer'].address, deployer),
    PolicyManager: new PolicyManager(output['PolicyManager'].address, deployer),
    ChaiPriceFeed: new ChaiPriceFeed(output['ChaiPriceFeed'].address, deployer),
    WdgldPriceFeed: new WdgldPriceFeed(output['WdgldPriceFeed'].address, deployer),
    ChainlinkPriceFeed: new ChainlinkPriceFeed(output['ChainlinkPriceFeed'].address, deployer),
    CompoundPriceFeed: new CompoundPriceFeed(output['CompoundPriceFeed'].address, deployer),
    SynthetixPriceFeed: new SynthetixPriceFeed(output['SynthetixPriceFeed'].address, deployer),
    StakehoundEthPriceFeed: new StakehoundEthPriceFeed(output['StakehoundEthPriceFeed'].address, deployer),
    AggregatedDerivativePriceFeed: new AggregatedDerivativePriceFeed(output['AggregatedDerivativePriceFeed'].address, deployer),
    ValueInterpreter: new ValueInterpreter(output['ValueInterpreter'].address, deployer),
    UniswapV2PoolPriceFeed: new UniswapV2PoolPriceFeed(output['UniswapV2PoolPriceFeed'].address, deployer),
    IntegrationManager: new IntegrationManager(output['IntegrationManager'].address, deployer),
    ParaSwapAdapter: new ParaSwapAdapter(output['ParaSwapAdapter'].address, deployer),
    SynthetixAdapter: new SynthetixAdapter(output['SynthetixAdapter'].address, deployer),
    ZeroExV2Adapter: new ZeroExV2Adapter(output['ZeroExV2Adapter'].address, deployer),
    CompoundAdapter: new CompoundAdapter(output['CompoundAdapter'].address, deployer),
    UniswapV2Adapter: new UniswapV2Adapter(output['UniswapV2Adapter'].address, deployer),
    TrackedAssetsAdapter: new TrackedAssetsAdapter(output['TrackedAssetsAdapter'].address, deployer),
    ChaiAdapter: new ChaiAdapter(output['ChaiAdapter'].address, deployer),
    KyberAdapter: new KyberAdapter(output['KyberAdapter'].address, deployer),
    FeeManager: new FeeManager(output['FeeManager'].address, deployer),
    ComptrollerLib: new ComptrollerLib(output['ComptrollerLib'].address, deployer),
    EntranceRateBurnFee: new EntranceRateBurnFee(output['EntranceRateBurnFee'].address, deployer),
    EntranceRateDirectFee: new EntranceRateDirectFee(output['EntranceRateDirectFee'].address, deployer),
    ManagementFee: new ManagementFee(output['ManagementFee'].address, deployer),
    PerformanceFee: new PerformanceFee(output['PerformanceFee'].address, deployer),
    AuthUserExecutedSharesRequestorLib: new AuthUserExecutedSharesRequestorLib(output['AuthUserExecutedSharesRequestorLib'].address, deployer),
    AuthUserExecutedSharesRequestorFactory: new AuthUserExecutedSharesRequestorFactory(output['AuthUserExecutedSharesRequestorFactory'].address, deployer),
    FundActionsWrapper: new FundActionsWrapper(output['FundActionsWrapper'].address, deployer),
    AdapterBlacklist: new AdapterBlacklist(output['AdapterBlacklist'].address, deployer),
    AdapterWhitelist: new AdapterWhitelist(output['AdapterWhitelist'].address, deployer),
    AssetBlacklist: new AssetBlacklist(output['AssetBlacklist'].address, deployer),
    AssetWhitelist: new AssetWhitelist(output['AssetWhitelist'].address, deployer),
    BuySharesCallerWhitelist: new BuySharesCallerWhitelist(output['BuySharesCallerWhitelist'].address, deployer),
    MaxConcentration: new MaxConcentration(output['MaxConcentration'].address, deployer),
    MinMaxInvestment: new MinMaxInvestment(output['MinMaxInvestment'].address, deployer),
    InvestorWhitelist: new InvestorWhitelist(output['InvestorWhitelist'].address, deployer),
    GuaranteedRedemption: new GuaranteedRedemption(output['GuaranteedRedemption'].address, deployer),
  } as const;

  return {
    deployer,
    deployment,
    config,
    accounts,
  } as const;
}
