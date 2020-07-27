import { AddressLike, BuidlerProvider } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { Engine } from '../../contracts/Engine';
import { FeeManagerFactory } from '../../contracts/FeeManagerFactory';
import { FundFactory } from '../../contracts/FundFactory';
import { IPriceSource } from '../../contracts/IPriceSource';
import { PolicyManagerFactory } from '../../contracts/PolicyManagerFactory';
import { Registry } from '../../contracts/Registry';
import { SharesFactory } from '../../contracts/SharesFactory';
import { SharesRequestor } from '../../contracts/SharesRequestor';
import { ValueInterpreter } from '../../contracts/ValueInterpreter';
import { VaultFactory } from '../../contracts/VaultFactory';
import { commonConfigSnapshot } from './commonConfig';

export async function registrySnapshot(
  provider: BuidlerProvider,
  mlnToken: AddressLike,
  nativeAsset: AddressLike,
) {
  const commonConfig = await commonConfigSnapshot(provider);
  const signer = provider.getSigner(commonConfig.accounts.deployer);
  const registry = await Registry.deploy(
    signer,
    commonConfig.accounts.mtc,
    commonConfig.accounts.mgm,
  );

  // These will soon be passed in the constructor, so pre-emptively placing them here
  await registry.setMlnToken(mlnToken);
  await registry.setNativeAsset(nativeAsset);

  return {
    registry,
  };
}

export async function engineSnapshot(
  provider: BuidlerProvider,
  registry: Registry,
  delay: ethers.BigNumberish,
) {
  const commonConfig = await commonConfigSnapshot(provider);
  const signer = provider.getSigner(commonConfig.accounts.deployer);
  const engine = await Engine.deploy(signer, delay, registry);

  return {
    engine,
  };
}

export async function fundFactorySnapshot(
  provider: BuidlerProvider,
  registry: Registry,
) {
  const commonConfig = await commonConfigSnapshot(provider);
  const signer = provider.getSigner(commonConfig.accounts.deployer);
  const feeManagerFactory = await FeeManagerFactory.deploy(signer);
  const policyManagerFactory = await PolicyManagerFactory.deploy(signer);
  const sharesFactory = await SharesFactory.deploy(signer);
  const vaultFactory = await VaultFactory.deploy(signer);

  const fundFactory = await FundFactory.deploy(
    signer,
    feeManagerFactory,
    sharesFactory,
    vaultFactory,
    policyManagerFactory,
    registry,
  );

  return {
    fundFactory,
  };
}

export async function sharesRequestorSnapshot(
  provider: BuidlerProvider,
  registry: Registry,
) {
  const commonConfig = await commonConfigSnapshot(provider);
  const signer = provider.getSigner(commonConfig.accounts.deployer);
  const sharesRequestor = await SharesRequestor.deploy(signer, registry);

  return {
    sharesRequestor,
  };
}

export async function valueInterpreterSnapshot(
  provider: BuidlerProvider,
  registry: Registry,
) {
  const commonConfig = await commonConfigSnapshot(provider);
  const signer = provider.getSigner(commonConfig.accounts.deployer);
  const valueInterpreter = await ValueInterpreter.deploy(signer, registry);

  return {
    valueInterpreter,
  };
}

// Add Registry config here, so that individual component snapshots can support a mock registry
// Pass in PriceSource, in case we want to test other price sources or use a mock
export async function infrastructureSnapshot(
  provider: BuidlerProvider,
  priceSource: IPriceSource,
  mlnToken: AddressLike,
  nativeAsset: AddressLike,
) {
  const commonConfig = await commonConfigSnapshot(provider);
  const { registry } = await registrySnapshot(provider, mlnToken, nativeAsset);

  const { engine } = await engineSnapshot(
    provider,
    registry,
    commonConfig.engine.initialThawDelay,
  );
  await registry.setEngine(engine);

  const { fundFactory } = await fundFactorySnapshot(provider, registry);
  await registry.setFundFactory(fundFactory);

  const { sharesRequestor } = await sharesRequestorSnapshot(provider, registry);
  await registry.setSharesRequestor(sharesRequestor);

  const { valueInterpreter } = await valueInterpreterSnapshot(
    provider,
    registry,
  );
  await registry.setValueInterpreter(valueInterpreter);

  await registry.setPriceSource(priceSource);

  return {
    engine,
    fundFactory,
    priceSource,
    registry,
    sharesRequestor,
    valueInterpreter,
  };
}
