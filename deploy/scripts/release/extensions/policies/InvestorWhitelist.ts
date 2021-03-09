import { InvestorWhitelistArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const policyManager = await get('PolicyManager');

  await deploy('InvestorWhitelist', {
    args: [policyManager.address] as InvestorWhitelistArgs,
    from: deployer.address,
    linkedData: {
      type: 'POLICY',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Policies', 'InvestorWhitelist'];
fn.dependencies = ['PolicyManager'];

export default fn;
