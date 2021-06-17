import {
  AssetFinalityResolver,
  ChainlinkPriceFeed,
  ComptrollerLib,
  ExternalPositionManager,
  Dispatcher,
  FeeManager,
  FundDeployer,
  IntegrationManager,
  PolicyManager,
  ReleaseStatusTypes,
  ValueInterpreter,
  VaultLib,
} from '@enzymefinance/protocol';
import { Signer } from 'ethers';

export async function createFundDeployer({
  deployer,
  assetFinalityResolver,
  chainlinkPriceFeed,
  externalPositionManager,
  dispatcher,
  feeManager,
  integrationManager,
  policyManager,
  valueInterpreter,
  vaultLib,
  setOnDispatcher = true,
  setReleaseStatusLive = true,
}: {
  deployer: Signer;
  assetFinalityResolver: AssetFinalityResolver;
  chainlinkPriceFeed: ChainlinkPriceFeed;
  externalPositionManager: ExternalPositionManager;
  dispatcher: Dispatcher;
  feeManager: FeeManager;
  integrationManager: IntegrationManager;
  policyManager: PolicyManager;
  valueInterpreter: ValueInterpreter;
  vaultLib: VaultLib;
  setOnDispatcher?: boolean;
  setReleaseStatusLive?: boolean;
}) {
  const nextFundDeployer = await FundDeployer.deploy(deployer, dispatcher, vaultLib);
  const nextComptrollerLib = await ComptrollerLib.deploy(
    deployer,
    dispatcher,
    nextFundDeployer,
    valueInterpreter,
    externalPositionManager,
    feeManager,
    integrationManager,
    policyManager,
    chainlinkPriceFeed,
    assetFinalityResolver,
  );
  await nextFundDeployer.setComptrollerLib(nextComptrollerLib);

  if (setReleaseStatusLive) {
    await nextFundDeployer.setReleaseStatus(ReleaseStatusTypes.Live);
  }
  if (setOnDispatcher) {
    await dispatcher.setCurrentFundDeployer(nextFundDeployer);
  }

  return nextFundDeployer;
}
