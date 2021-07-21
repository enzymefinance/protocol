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
  ProtocolFeeTracker,
  ValueInterpreter,
  VaultLib,
} from '@enzymefinance/protocol';
import { Signer } from 'ethers';

// TODO: Should refactor this function to take all deployment contracts and set up everything by default,
// unless overrides are passed-in
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
  setReleaseLive = true,
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
  setReleaseLive?: boolean;
}) {
  const nextFundDeployer = await FundDeployer.deploy(deployer, dispatcher);

  // TODO: Shortcut for now, can pass in param later
  const protocolFeeReserve = await vaultLib.getProtocolFeeReserve();

  const nextComptrollerLib = await ComptrollerLib.deploy(
    deployer,
    dispatcher,
    protocolFeeReserve,
    nextFundDeployer,
    valueInterpreter,
    externalPositionManager,
    feeManager,
    integrationManager,
    policyManager,
    chainlinkPriceFeed,
    assetFinalityResolver,
    await vaultLib.getMlnToken(),
  );
  await nextFundDeployer.setComptrollerLib(nextComptrollerLib);

  const nextProtocolFeeTracker = await ProtocolFeeTracker.deploy(deployer, nextFundDeployer);
  await nextFundDeployer.setProtocolFeeTracker(nextProtocolFeeTracker);

  const nextVaultLib = await VaultLib.deploy(
    deployer,
    externalPositionManager,
    await vaultLib.getProtocolFeeReserve(),
    nextProtocolFeeTracker,
    await vaultLib.getMlnToken(),
    await vaultLib.getWethToken(),
  );
  await nextFundDeployer.setVaultLib(nextVaultLib);

  if (setReleaseLive) {
    await nextFundDeployer.setReleaseLive();
  }
  if (setOnDispatcher) {
    await dispatcher.setCurrentFundDeployer(nextFundDeployer);
  }

  return nextFundDeployer;
}
