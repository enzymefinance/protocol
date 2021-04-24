import { AddressLike } from '@enzymefinance/ethers';
import {
  AssetFinalityResolver,
  ChainlinkPriceFeed,
  ComptrollerLib,
  DebtPositionManager,
  Dispatcher,
  FeeManager,
  FundDeployer,
  IntegrationManager,
  PolicyManager,
  ReleaseStatusTypes,
  SynthetixPriceFeed,
  ValueInterpreter,
  VaultLib,
} from '@enzymefinance/protocol';
import { Signer } from 'ethers';

export async function createFundDeployer({
  deployer,
  assetFinalityResolver,
  chainlinkPriceFeed,
  debtPositionManager,
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
  debtPositionManager: DebtPositionManager;
  dispatcher: Dispatcher;
  feeManager: FeeManager;
  integrationManager: IntegrationManager;
  policyManager: PolicyManager;
  synthetixAddressResolverAddress: AddressLike;
  synthetixPriceFeed: SynthetixPriceFeed;
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
    debtPositionManager,
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
