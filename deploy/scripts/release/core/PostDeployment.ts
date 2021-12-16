import {
  addressListRegistryAddToListSelector,
  addressListRegistryAttestListsSelector,
  addressListRegistryCreateListSelector,
  addressListRegistryRemoveFromListSelector,
  addressListRegistrySetListOwnerSelector,
  addressListRegistrySetListUpdateTypeSelector,
  curveMinterMintManySelector,
  curveMinterMintSelector,
  curveMinterToggleApproveMintSelector,
  FundDeployer as FundDeployerContract,
  pricelessAssetBypassStartAssetBypassTimelockSelector,
  synthetixAssignExchangeDelegateSelector,
  vaultCallAnyDataHash,
} from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, log },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');
  const addressListRegistry = await get('AddressListRegistry');
  const onlyRemoveDustExternalPositionPolicy = await get('OnlyRemoveDustExternalPositionPolicy');
  const onlyUntrackDustOrPricelessAssetsPolicy = await get('OnlyUntrackDustOrPricelessAssetsPolicy');
  const cumulativeSlippageTolerancePolicy = await get('CumulativeSlippageTolerancePolicy');

  const fundDeployerInstance = new FundDeployerContract(fundDeployer.address, deployer);

  // Register vault calls
  const vaultCalls = [
    // Calls to trigger the PricelessAssetBypassMixin's timelock
    [
      onlyRemoveDustExternalPositionPolicy.address,
      pricelessAssetBypassStartAssetBypassTimelockSelector,
      vaultCallAnyDataHash,
    ],
    [
      onlyUntrackDustOrPricelessAssetsPolicy.address,
      pricelessAssetBypassStartAssetBypassTimelockSelector,
      vaultCallAnyDataHash,
    ],
    [
      cumulativeSlippageTolerancePolicy.address,
      pricelessAssetBypassStartAssetBypassTimelockSelector,
      vaultCallAnyDataHash,
    ],
    [addressListRegistry.address, addressListRegistryAddToListSelector, vaultCallAnyDataHash],
    [addressListRegistry.address, addressListRegistryAttestListsSelector, vaultCallAnyDataHash],
    [addressListRegistry.address, addressListRegistryCreateListSelector, vaultCallAnyDataHash],
    [addressListRegistry.address, addressListRegistryRemoveFromListSelector, vaultCallAnyDataHash],
    [addressListRegistry.address, addressListRegistrySetListOwnerSelector, vaultCallAnyDataHash],
    [addressListRegistry.address, addressListRegistrySetListUpdateTypeSelector, vaultCallAnyDataHash],
  ];

  // Calls to allow claiming rewards from Curve's Minter
  if (config.curve) {
    vaultCalls.push(
      [config.curve.minter, curveMinterMintSelector, vaultCallAnyDataHash],
      [config.curve.minter, curveMinterMintManySelector, vaultCallAnyDataHash],
      [config.curve.minter, curveMinterToggleApproveMintSelector, vaultCallAnyDataHash],
    );
  }

  // Allows delegating trading on Synthetix to the SynthetixAdapter only
  if (config.synthetix) {
    vaultCalls.push([
      config.synthetix.delegateApprovals,
      synthetixAssignExchangeDelegateSelector,
      vaultCallAnyDataHash,
    ]);
  }

  const vaultCallValues = Object.values(vaultCalls);
  const vaultCallContracts = vaultCallValues.map(([contract]) => contract);
  const vaultCallFunctionSigs = vaultCallValues.map(([, functionSig]) => functionSig);
  const vaultCallDataHashes = vaultCallValues.map(([, , dataHash]) => dataHash);
  log('Registering vault calls');

  await fundDeployerInstance.registerVaultCalls(vaultCallContracts, vaultCallFunctionSigs, vaultCallDataHashes);
};

fn.tags = ['Release'];
fn.dependencies = [
  'FundDeployer',
  'AddressListRegistry',
  'CumulativeSlippageTolerancePolicy',
  'OnlyRemoveDustExternalPositionPolicy',
  'OnlyUntrackDustOrPricelessAssetsPolicy',
];
fn.runAtTheEnd = true;

export default fn;
