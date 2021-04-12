import { AddressLike } from '@enzymefinance/ethers';
import {
  AssetFinalityResolver,
  ChainlinkPriceFeed,
  ComptrollerLib,
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
import { BytesLike, Signer } from 'ethers';

export async function createFundDeployer({
  deployer,
  assetFinalityResolver,
  chainlinkPriceFeed,
  dispatcher,
  feeManager,
  integrationManager,
  policyManager,
  valueInterpreter,
  vaultLib,
  vaultCallContracts = [],
  vaultCallSelectors = [],
  setOnDispatcher = true,
  setReleaseStatusLive = true,
}: {
  deployer: Signer;
  assetFinalityResolver: AssetFinalityResolver;
  chainlinkPriceFeed: ChainlinkPriceFeed;
  dispatcher: Dispatcher;
  feeManager: FeeManager;
  integrationManager: IntegrationManager;
  policyManager: PolicyManager;
  synthetixAddressResolverAddress: AddressLike;
  synthetixPriceFeed: SynthetixPriceFeed;
  valueInterpreter: ValueInterpreter;
  vaultLib: VaultLib;
  vaultCallContracts?: AddressLike[];
  vaultCallSelectors?: BytesLike[];
  setOnDispatcher?: boolean;
  setReleaseStatusLive?: boolean;
}) {
  const nextFundDeployer = await FundDeployer.deploy(
    deployer,
    dispatcher,
    vaultLib,
    vaultCallContracts,
    vaultCallSelectors,
  );
  const nextComptrollerLib = await ComptrollerLib.deploy(
    deployer,
    dispatcher,
    nextFundDeployer,
    valueInterpreter,
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
