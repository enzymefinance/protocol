import { ExitRateDirectFeeArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const feeManager = await get('FeeManager');

  await deploy('ExitRateDirectFee', {
    args: [feeManager.address] as ExitRateDirectFeeArgs,
    from: deployer.address,
    linkedData: {
      type: 'FEE',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Fees', 'ExitRateDirectFee'];
fn.dependencies = ['FeeManager'];

export default fn;
