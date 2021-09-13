import {
  FundDeployer as FundDeployerContract,
  pricelessAssetBypassStartAssetBypassTimelockSelector,
  vaultCallAnyDataHash,
} from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, log },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');
  const onlyUntrackDustOrPricelessAssetsPolicy = await get('OnlyUntrackDustOrPricelessAssetsPolicy');

  const fundDeployerInstance = new FundDeployerContract(fundDeployer.address, deployer);

  // Register vault calls
  const vaultCalls = [
    ...config.vaultCalls,
    [
      onlyUntrackDustOrPricelessAssetsPolicy.address,
      pricelessAssetBypassStartAssetBypassTimelockSelector,
      vaultCallAnyDataHash,
    ],
  ];
  const vaultCallValues = Object.values(vaultCalls);

  const vaultCallContracts = vaultCallValues.map(([contract]) => contract);
  const vaultCallFunctionSigs = vaultCallValues.map(([, functionSig]) => functionSig);
  const vaultCallDataHashes = vaultCallValues.map(([, , dataHash]) => dataHash);
  log('Registering vault calls');
  await fundDeployerInstance.registerVaultCalls(vaultCallContracts, vaultCallFunctionSigs, vaultCallDataHashes);
};

fn.tags = ['Release'];
fn.dependencies = ['FundDeployer', 'OnlyUntrackDustOrPricelessAssetsPolicy'];
fn.runAtTheEnd = true;

export default fn;
