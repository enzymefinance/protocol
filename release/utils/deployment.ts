import { AddressLike } from '@crestproject/crestproject';
import { describeDeployment } from '@melonproject/utils';
import { BigNumberish, BytesLike, Signer } from 'ethers';
import {
  AdapterBlacklist,
  AdapterWhitelist,
  AggregatedDerivativePriceFeed,
  AssetBlacklist,
  AssetWhitelist,
  ChaiAdapter,
  ChainlinkPriceFeed,
  ChaiPriceFeed,
  ComptrollerLib,
  Engine,
  FeeManager,
  FundDeployer,
  IntegrationManager,
  KyberAdapter,
  ManagementFee,
  MaxConcentration,
  PerformanceFee,
  PolicyManager,
  InvestorWhitelist,
  TrackedAssetsAdapter,
  ValueInterpreter,
  VaultLib,
} from './contracts';

export interface ReleaseDeploymentConfig {
  deployer: Signer;
  dispatcher: AddressLike;
  mgm: AddressLike;
  weth: AddressLike;
  mln: AddressLike;
  registeredVaultCalls: {
    contracts: AddressLike[];
    selectors: BytesLike[];
  };
  engine: {
    thawDelay: BigNumberish;
    etherTakers: AddressLike[];
  };
  chainlink: {
    rateQuoteAsset: AddressLike;
    primitives: AddressLike[];
    aggregators: AddressLike[];
  };
  integratees: {
    chai: AddressLike;
    kyber: AddressLike;
    makerDao: {
      dai: AddressLike;
      pot: AddressLike;
    };
  };
}

export interface ReleaseDeploymentOutput {
  // Core
  comptrollerLib: Promise<ComptrollerLib>;
  fundDeployer: Promise<FundDeployer>;
  vaultLib: Promise<VaultLib>;
  // Shared Infrastructure
  engine: Promise<Engine>;
  valueInterpreter: Promise<ValueInterpreter>;
  // Extensions
  feeManager: Promise<FeeManager>;
  integrationManager: Promise<IntegrationManager>;
  policyManager: Promise<PolicyManager>;
  // Price feeds
  chainlinkPriceFeed: Promise<ChainlinkPriceFeed>;
  // Derivative price feeds
  aggregatedDerivativePriceFeed: Promise<AggregatedDerivativePriceFeed>;
  chaiPriceFeed: Promise<ChaiPriceFeed>;
  // Integration adapters
  chaiAdapter: Promise<ChaiAdapter>;
  kyberAdapter: Promise<KyberAdapter>;
  trackedAssetsAdapter: Promise<TrackedAssetsAdapter>;
  // Fees
  managementFee: Promise<ManagementFee>;
  performanceFee: Promise<PerformanceFee>;
  // Policies
  adapterBlacklist: Promise<AdapterBlacklist>;
  adapterWhitelist: Promise<AdapterWhitelist>;
  assetBlacklist: Promise<AssetBlacklist>;
  assetWhitelist: Promise<AssetWhitelist>;
  maxConcentration: Promise<MaxConcentration>;
  investorWhitelist: Promise<InvestorWhitelist>;
}

export const deployRelease = describeDeployment<
  ReleaseDeploymentConfig,
  ReleaseDeploymentOutput
>({
  // Core
  async comptrollerLib(config, deployment) {
    const comptrollerLib = await ComptrollerLib.deploy(
      config.deployer,
      await deployment.fundDeployer,
      await deployment.valueInterpreter,
      await deployment.chainlinkPriceFeed,
      await deployment.aggregatedDerivativePriceFeed,
      await deployment.feeManager,
      await deployment.integrationManager,
      await deployment.policyManager,
      await deployment.engine,
    );

    const fundDeployer = await deployment.fundDeployer;
    await fundDeployer.setComptrollerLib(comptrollerLib);

    return comptrollerLib;
  },
  async fundDeployer(config, deployment) {
    return FundDeployer.deploy(
      config.deployer,
      config.dispatcher,
      await deployment.engine,
      await deployment.vaultLib,
      config.registeredVaultCalls.contracts,
      config.registeredVaultCalls.selectors,
    );
  },
  async vaultLib(config) {
    return VaultLib.deploy(config.deployer);
  },
  // Shared Infrastructure
  async engine(config, deployment) {
    return Engine.deploy(
      config.deployer,
      config.dispatcher,
      config.mgm,
      config.mln,
      config.weth,
      await deployment.chainlinkPriceFeed,
      await deployment.valueInterpreter,
      config.engine.thawDelay,
      config.engine.etherTakers,
    );
  },
  async valueInterpreter(config) {
    return ValueInterpreter.deploy(config.deployer);
  },
  // Extensions
  async feeManager(config, deployment) {
    return await FeeManager.deploy(
      config.deployer,
      await deployment.fundDeployer,
    );
  },
  async integrationManager(config, deployment) {
    return IntegrationManager.deploy(
      config.deployer,
      await deployment.fundDeployer,
      await deployment.policyManager,
    );
  },
  async policyManager(config, deployment) {
    return PolicyManager.deploy(config.deployer, await deployment.fundDeployer);
  },
  // Price feeds
  async chainlinkPriceFeed(config) {
    return ChainlinkPriceFeed.deploy(
      config.deployer,
      config.dispatcher,
      config.chainlink.rateQuoteAsset,
      config.chainlink.primitives,
      config.chainlink.aggregators,
    );
  },
  // Derivative price feeds
  async aggregatedDerivativePriceFeed(config, deployment) {
    return AggregatedDerivativePriceFeed.deploy(
      config.deployer,
      config.dispatcher,
      [config.integratees.chai],
      [await deployment.chaiPriceFeed],
    );
  },
  async chaiPriceFeed(config) {
    return ChaiPriceFeed.deploy(
      config.deployer,
      config.integratees.chai,
      config.integratees.makerDao.dai,
      config.integratees.makerDao.pot,
    );
  },
  // Adapters
  async chaiAdapter(config, deployment) {
    return ChaiAdapter.deploy(
      config.deployer,
      await deployment.integrationManager,
      config.integratees.chai,
      config.integratees.makerDao.dai,
    );
  },
  async kyberAdapter(config, deployment) {
    return KyberAdapter.deploy(
      config.deployer,
      await deployment.integrationManager,
      config.integratees.kyber,
      config.weth,
    );
  },
  async trackedAssetsAdapter(config, deployment) {
    return TrackedAssetsAdapter.deploy(
      config.deployer,
      await deployment.integrationManager,
    );
  },
  // Fees
  async managementFee(config, deployment) {
    return ManagementFee.deploy(config.deployer, await deployment.feeManager);
  },
  async performanceFee(config, deployment) {
    return PerformanceFee.deploy(config.deployer, await deployment.feeManager);
  },
  // Policies
  async adapterBlacklist(config, deployment) {
    return AdapterBlacklist.deploy(
      config.deployer,
      await deployment.policyManager,
    );
  },
  async adapterWhitelist(config, deployment) {
    return AdapterWhitelist.deploy(
      config.deployer,
      await deployment.policyManager,
    );
  },
  async assetBlacklist(config, deployment) {
    return AssetBlacklist.deploy(
      config.deployer,
      await deployment.policyManager,
    );
  },
  async assetWhitelist(config, deployment) {
    return AssetWhitelist.deploy(
      config.deployer,
      await deployment.policyManager,
    );
  },
  async maxConcentration(config, deployment) {
    return MaxConcentration.deploy(
      config.deployer,
      await deployment.policyManager,
    );
  },
  async investorWhitelist(config, deployment) {
    return InvestorWhitelist.deploy(
      config.deployer,
      await deployment.policyManager,
    );
  },
  // Post-deployment config
  async postDeployment(_config, deployment) {
    // Register adapters
    const adapters = [
      await deployment.chaiAdapter,
      await deployment.kyberAdapter,
      await deployment.trackedAssetsAdapter,
    ];
    const integrationManager = await deployment.integrationManager;
    await integrationManager.registerAdapters(adapters);

    // Register fees
    const fees = [
      await deployment.managementFee,
      await deployment.performanceFee,
    ];
    const feeManager = await deployment.feeManager;
    await feeManager.registerFees(fees);

    // Register policies
    const policies = [
      await deployment.adapterBlacklist,
      await deployment.adapterWhitelist,
      await deployment.assetBlacklist,
      await deployment.assetWhitelist,
      await deployment.maxConcentration,
      await deployment.investorWhitelist,
    ];
    const policyManager = await deployment.policyManager;
    await policyManager.registerPolicies(policies);
  },
});
