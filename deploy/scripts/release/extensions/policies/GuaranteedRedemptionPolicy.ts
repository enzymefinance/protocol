import type { GuaranteedRedemptionPolicyArgs } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const policyManager = await get('PolicyManager');
  const fundDeployer = await get('FundDeployer');

  await deploy('GuaranteedRedemptionPolicy', {
    args: [
      policyManager.address,
      fundDeployer.address,
      config.policies.guaranteedRedemption.redemptionWindowBuffer,
      [],
    ] as GuaranteedRedemptionPolicyArgs,
    from: deployer.address,
    linkedData: {
      type: 'POLICY',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Policies', 'GuaranteedRedemptionPolicy'];
fn.dependencies = ['PolicyManager'];
fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
