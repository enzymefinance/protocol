import type { DeployFunction } from 'hardhat-deploy/types';

import { isOneOfNetworks, Network } from '../../../../utils/helpers';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];

  const mapleV1ToV2PoolMapper = await get('MapleV1ToV2PoolMapper');

  await deploy('MapleLiquidityPositionLib', {
    args: [mapleV1ToV2PoolMapper.address],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ExternalPositions', 'MapleLiquidityPositionLib'];
fn.dependencies = ['MapleV1ToV2PoolMapper'];

fn.skip = async (hre) => {
  const chain = await hre.getChainId();

  return !isOneOfNetworks(chain, [Network.HOMESTEAD]);
};

export default fn;
