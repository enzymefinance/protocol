import type { OnlyRemoveDustExternalPositionPolicyArgs } from '@enzymefinance/protocol';
import { ONE_DAY_IN_SECONDS, OnlyRemoveDustExternalPositionPolicy } from '@enzymefinance/protocol';
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

  const onlyRemoveDustExternalPositionPolicy = await deploy('OnlyRemoveDustExternalPositionPolicy', {
    args: [
      policyManager.address,
      fundDeployer.address,
      valueInterpreter.address,
      config.weth,
      ONE_DAY_IN_SECONDS * 7, // timelock
      ONE_DAY_IN_SECONDS * 2, // time limit
    ] as OnlyRemoveDustExternalPositionPolicyArgs,
    from: deployer.address,
    linkedData: {
      type: 'POLICY',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (onlyRemoveDustExternalPositionPolicy.newlyDeployed) {
    const onlyRemoveDustExternalPositionPolicyContract = new OnlyRemoveDustExternalPositionPolicy(
      onlyRemoveDustExternalPositionPolicy.address,
      deployer,
    );
    await onlyRemoveDustExternalPositionPolicyContract.setDustToleranceInWeth(utils.parseEther('0.05'));
  }
};

fn.tags = ['Release', 'Policies', 'OnlyRemoveDustExternalPositionPolicy'];
fn.dependencies = ['Config', 'FundDeployer', 'PolicyManager', 'ValueInterpreter'];

export default fn;
