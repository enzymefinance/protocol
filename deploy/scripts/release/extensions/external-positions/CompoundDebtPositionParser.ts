import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];

  const compoundPriceFeed = await get('CompoundPriceFeed');
  const valueInterpreter = await get('ValueInterpreter');

  await deploy('CompoundDebtPositionParser', {
    args: [compoundPriceFeed.address, valueInterpreter.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'CompoundDebtPositionParser'];
fn.dependencies = ['CompoundPriceFeed', 'Config', 'ValueInterpreter'];
export default fn;
