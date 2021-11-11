import type { EntranceRateBurnFeeArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const feeManager = await get('FeeManager');

  await deploy('EntranceRateBurnFee', {
    args: [feeManager.address] as EntranceRateBurnFeeArgs,
    from: deployer.address,
    linkedData: {
      type: 'FEE',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Fees', 'EntranceRateBurnFee'];
fn.dependencies = ['FeeManager'];

export default fn;
