import { AddressLike } from '@crestproject/crestproject';
import { describeDeployment } from '@melonproject/utils';
import { BigNumberish, Signer } from 'ethers';
import {
  AggregatedDerivativePriceFeed,
  ChaiAdapter,
  ChaiPriceFeed,
  FeeManager,
  IntegrationManager,
  KyberAdapter,
  PolicyManager,
  VaultLib,
  ChainlinkPriceFeed,
  ComptrollerLib,
  Engine,
  FundDeployer,
  ValueInterpreter,
} from './contracts';

export interface ReleaseDeploymentConfig {
  deployer: Signer;
  dispatcher: AddressLike;
  mtc: AddressLike;
  mgm: AddressLike;
  weth: AddressLike;
  mln: AddressLike;
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
  vaultLib: Promise<VaultLib>;
  fundDeployer: Promise<FundDeployer>;
  engine: Promise<Engine>;
  chainlinkPriceFeed: Promise<ChainlinkPriceFeed>;
  aggregatedDerivativePriceFeed: Promise<AggregatedDerivativePriceFeed>;
  valueInterpreter: Promise<ValueInterpreter>;
  comptrollerLib: Promise<ComptrollerLib>;
  feeManager: Promise<FeeManager>;
  integrationManager: Promise<IntegrationManager>;
  policyManager: Promise<PolicyManager>;
  chaiAdapter: Promise<ChaiAdapter>;
  chaiPriceFeed: Promise<ChaiPriceFeed>;
}

export const deployRelease = describeDeployment<
  ReleaseDeploymentConfig,
  ReleaseDeploymentOutput
>({
  async vaultLib(config) {
    return VaultLib.deploy(config.deployer);
  },
  async fundDeployer(config, deployment) {
    return FundDeployer.deploy(
      config.deployer,
      config.dispatcher,
      await deployment.engine,
      await deployment.vaultLib,
      config.mtc,
    );
  },
  async valueInterpreter(config) {
    return ValueInterpreter.deploy(config.deployer);
  },
  async engine(config, deployment) {
    return Engine.deploy(
      config.deployer,
      config.mgm,
      config.mtc,
      config.mln,
      config.weth,
      await deployment.chainlinkPriceFeed,
      await deployment.valueInterpreter,
      config.engine.thawDelay,
      config.engine.etherTakers,
    );
  },
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
  // Extensions
  async feeManager(config, deployment) {
    return FeeManager.deploy(config.deployer, await deployment.fundDeployer);
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
  async chaiPriceFeed(config) {
    return ChaiPriceFeed.deploy(
      config.deployer,
      config.integratees.chai,
      config.integratees.makerDao.dai,
      config.integratees.makerDao.pot,
    );
  },
  async aggregatedDerivativePriceFeed(config, deployment) {
    return AggregatedDerivativePriceFeed.deploy(
      config.deployer,
      config.dispatcher,
      [config.integratees.chai],
      [await deployment.chaiPriceFeed],
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
});
