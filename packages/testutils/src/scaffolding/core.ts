import { BytesLike, Signer } from 'ethers';
import { AddressLike } from '@crestproject/crestproject';
import {
  AssetFinalityResolver,
  ChainlinkPriceFeed,
  ComptrollerLib,
  Dispatcher,
  FeeManager,
  FundDeployer,
  FundLifecycleLib,
  IntegrationManager,
  PermissionedVaultActionLib,
  PolicyManager,
  ValueInterpreter,
  VaultLib,
} from '@melonproject/protocol';

export async function createFundDeployer({
  assetFinalityResolver,
  deployer,
  chainlinkPriceFeed,
  dispatcher,
  feeManager,
  integrationManager,
  permissionedVaultActionLib,
  policyManager,
  valueInterpreter,
  vaultLib,
  vaultCallContracts = [],
  vaultCallSelectors = [],
  setOnDispatcher = true,
}: {
  assetFinalityResolver: AssetFinalityResolver;
  deployer: Signer;
  chainlinkPriceFeed: ChainlinkPriceFeed;
  dispatcher: Dispatcher;
  feeManager: FeeManager;
  integrationManager: IntegrationManager;
  permissionedVaultActionLib: PermissionedVaultActionLib;
  policyManager: PolicyManager;
  valueInterpreter: ValueInterpreter;
  vaultLib: VaultLib;
  vaultCallContracts?: AddressLike[];
  vaultCallSelectors?: BytesLike[];
  setOnDispatcher?: boolean;
}) {
  const nextFundDeployer = await FundDeployer.deploy(
    deployer,
    dispatcher,
    vaultLib,
    vaultCallContracts,
    vaultCallSelectors,
  );
  const nextFundLifecycleLib = await FundLifecycleLib.deploy(
    deployer,
    nextFundDeployer,
    chainlinkPriceFeed,
    feeManager,
    integrationManager,
    policyManager,
  );
  const nextComptrollerLib = await ComptrollerLib.deploy(
    deployer,
    nextFundDeployer,
    valueInterpreter,
    feeManager,
    integrationManager,
    policyManager,
    nextFundLifecycleLib,
    permissionedVaultActionLib,
    assetFinalityResolver,
  );
  await nextFundDeployer.setComptrollerLib(nextComptrollerLib);

  if (setOnDispatcher) {
    await dispatcher.setCurrentFundDeployer(nextFundDeployer);
  }

  return nextFundDeployer;
}
