import { TrackedAssetsAdapterArgs } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';
import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');
  const integrationManager = await get('IntegrationManager');
  const valueInterpreter = await get('ValueInterpreter');

  await deploy('TrackedAssetsAdapter', {
    args: [
      fundDeployer.address,
      integrationManager.address,
      valueInterpreter.address,
      config.weth,
    ] as TrackedAssetsAdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'TrackedAssetsAdapter'];
fn.dependencies = ['Config', 'FundDeployer', 'IntegrationManager', 'ValueInterpreter'];

export default fn;
