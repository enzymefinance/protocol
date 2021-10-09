import {
  AssetFinalityResolver,
  ComptrollerLib,
  ExternalPositionManager,
  Dispatcher,
  FeeManager,
  FundDeployer,
  GasRelayPaymasterFactory,
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
  externalPositionManager,
  dispatcher,
  gasRelayPaymasterFactory,
  valueInterpreter,
  vaultLib,
  setOnDispatcher = true,
  setReleaseLive = true,
}: {
  deployer: Signer;
  assetFinalityResolver: AssetFinalityResolver;
  externalPositionManager: ExternalPositionManager;
  dispatcher: Dispatcher;
  feeManager: FeeManager;
  gasRelayPaymasterFactory: GasRelayPaymasterFactory;
  integrationManager: IntegrationManager;
  policyManager: PolicyManager;
  valueInterpreter: ValueInterpreter;
  vaultLib: VaultLib;
  setOnDispatcher?: boolean;
  setReleaseLive?: boolean;
}) {
  const mlnToken = await vaultLib.getMlnToken();
  const wethToken = await vaultLib.getWethToken();

  // TODO: Shortcut for now, can pass in param later
  const protocolFeeReserve = await vaultLib.getProtocolFeeReserve();

  const nextFundDeployer = await FundDeployer.deploy(deployer, dispatcher, gasRelayPaymasterFactory);

  // Re-deploy extensions with new FundDeployer
  const nextPolicyManager = await PolicyManager.deploy(deployer, nextFundDeployer, gasRelayPaymasterFactory);
  const nextExternalPositionManager = await ExternalPositionManager.deploy(
    deployer,
    nextFundDeployer,
    await externalPositionManager.getExternalPositionFactory(),
    nextPolicyManager,
  );
  const nextFeeManager = await FeeManager.deploy(deployer, nextFundDeployer);
  const nextIntegrationManager = await IntegrationManager.deploy(
    deployer,
    nextFundDeployer,
    nextPolicyManager,
    valueInterpreter,
  );

  const nextComptrollerLib = await ComptrollerLib.deploy(
    deployer,
    dispatcher,
    protocolFeeReserve,
    nextFundDeployer,
    valueInterpreter,
    nextExternalPositionManager,
    nextFeeManager,
    nextIntegrationManager,
    nextPolicyManager,
    assetFinalityResolver,
    gasRelayPaymasterFactory,
    mlnToken,
    wethToken,
  );

  await nextFundDeployer.setComptrollerLib(nextComptrollerLib);

  const nextProtocolFeeTracker = await ProtocolFeeTracker.deploy(deployer, nextFundDeployer);
  await nextFundDeployer.setProtocolFeeTracker(nextProtocolFeeTracker);

  const nextVaultLib = await VaultLib.deploy(
    deployer,
    externalPositionManager,
    await vaultLib.getGasRelayPaymasterFactory(),
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
