import { FeeManagerArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const feeManager = await get('FeeManager');

  await deploy('ManagementFee', {
    args: [feeManager.address] as FeeManagerArgs,
    from: deployer.address,
    linkedData: {
      type: 'FEE',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Fees', 'ManagementFee'];
fn.dependencies = ['FeeManager'];

export default fn;
