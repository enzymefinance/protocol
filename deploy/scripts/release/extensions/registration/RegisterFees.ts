import { FeeManager } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, all, log },
    ethers: { getSigners },
  } = hre;
  const fees = Object.values(await all())
    .filter((item) => item.linkedData?.type === 'FEE')
    .map((item) => item.address.toLowerCase());

  if (fees.length) {
    const deployer = (await getSigners())[0];
    const feeManager = await get('FeeManager');
    const feeManagerInstance = new FeeManager(feeManager.address, deployer);
    log('Registering fees');
    await feeManagerInstance.registerFees(fees);
  }
};

fn.tags = ['Release', 'Fees', 'RegisterFees'];
fn.dependencies = ['FeeManager'];
fn.runAtTheEnd = true;

export default fn;
