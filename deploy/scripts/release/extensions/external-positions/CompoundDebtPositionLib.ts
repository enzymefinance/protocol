import type { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';
import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  await deploy('CompoundDebtPositionLib', {
    args: [config.compound.comptroller, config.primitives.comp, config.weth],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  // CompoundDebtPositionLib.init() is currently empty. Call .init() if that changes.
};

fn.tags = ['Release', 'ExternalPositions', 'CompoundDebtPositionLib'];
fn.dependencies = ['Config'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
