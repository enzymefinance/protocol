import {
  FundDeployer as FundDeployerContract,
  pricelessAssetBypassStartAssetBypassTimelockSelector,
  sighash,
  vaultCallAnyDataHash,
} from '@enzymefinance/protocol';
import { utils } from 'ethers';
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
  ];

  // Calls to allow claiming rewards from Curve's Minter
  if (config.curve) {
    vaultCalls.push(
      [config.curve.minter, sighash(utils.FunctionFragment.fromString('mint(address)')), vaultCallAnyDataHash],
      [config.curve.minter, sighash(utils.FunctionFragment.fromString('mint_many(address[8])')), vaultCallAnyDataHash],
      [
        config.curve.minter,
        sighash(utils.FunctionFragment.fromString('toggle_approve_mint(address)')),
        vaultCallAnyDataHash,
      ],
    );
  }

  // Allows delegating trading on Synthetix to the SynthetixAdapter only
  if (config.synthetix) {
    vaultCalls.push([
      config.synthetix.delegateApprovals,
      sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address)')),
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
  'CumulativeSlippageTolerancePolicy',
  'OnlyRemoveDustExternalPositionPolicy',
  'OnlyUntrackDustOrPricelessAssetsPolicy',
];
fn.runAtTheEnd = true;

export default fn;
