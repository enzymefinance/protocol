import type { OnlyUntrackDustOrPricelessAssetsPolicyArgs } from '@enzymefinance/protocol';
import { ONE_DAY_IN_SECONDS, OnlyUntrackDustOrPricelessAssetsPolicy } from '@enzymefinance/protocol';
import { utils } from 'ethers';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const fundDeployer = await get('FundDeployer');
  const policyManager = await get('PolicyManager');
  const valueInterpreter = await get('ValueInterpreter');

  const onlyUntrackDustOrPricelessAssetsPolicy = await deploy('OnlyUntrackDustOrPricelessAssetsPolicy', {
    args: [
      policyManager.address,
      fundDeployer.address,
      valueInterpreter.address,
      config.weth,
      ONE_DAY_IN_SECONDS * 7, // timelock
      ONE_DAY_IN_SECONDS * 2, // time limit
    ] as OnlyUntrackDustOrPricelessAssetsPolicyArgs,
    from: deployer.address,
    linkedData: {
      type: 'POLICY',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const onlyUntrackDustOrPricelessAssetsPolicyContract = new OnlyUntrackDustOrPricelessAssetsPolicy(
    onlyUntrackDustOrPricelessAssetsPolicy.address,
    deployer,
  );
  await onlyUntrackDustOrPricelessAssetsPolicyContract.setDustToleranceInWeth(utils.parseEther('0.05'));
};

fn.tags = ['Release', 'Policies', 'OnlyUntrackDustOrPricelessAssetsPolicy'];
fn.dependencies = ['Config', 'FundDeployer', 'PolicyManager', 'ValueInterpreter'];

export default fn;
