import { MaxConcentrationArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const policyManager = await get('PolicyManager');
  const valueInterpreter = await get('ValueInterpreter');

  await deploy('MaxConcentration', {
    args: [policyManager.address, valueInterpreter.address] as MaxConcentrationArgs,
    from: deployer.address,
    linkedData: {
      type: 'POLICY',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Policies', 'MaxConcentration'];
fn.dependencies = ['PolicyManager', 'ValueInterpreter'];

export default fn;
