import { ComptrollerLibArgs, FundDeployer as FundDeployerContract } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';
import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const config = await loadConfig(hre);
  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');
  const fundDeployer = await get('FundDeployer');
  const valueInterpreter = await get('ValueInterpreter');
  const feeManager = await get('FeeManager');
  const integrationManager = await get('IntegrationManager');
  const externalPositionManager = await get('ExternalPositionManager');
  const policyManager = await get('PolicyManager');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');
  const assetFinalityResolver = await get('AssetFinalityResolver');

  const comptrollerLib = await deploy('ComptrollerLib', {
    args: [
      dispatcher.address,
      fundDeployer.address,
      valueInterpreter.address,
      externalPositionManager.address,
      feeManager.address,
      integrationManager.address,
      policyManager.address,
      chainlinkPriceFeed.address,
      assetFinalityResolver.address,
      config.primitives.mln,
    ] as ComptrollerLibArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (comptrollerLib.newlyDeployed) {
    const fundDeployerInstance = new FundDeployerContract(fundDeployer.address, deployer);
    log('Updating ComptrollerLib on FundDeployer');
    await fundDeployerInstance.setComptrollerLib(comptrollerLib.address);
  }
};

fn.tags = ['Release', 'ComptrollerLib'];
fn.dependencies = [
  'Config',
  'Dispatcher',
  'ExternalPositionManager',
  'FundDeployer',
  'ValueInterpreter',
  'FeeManager',
  'IntegrationManager',
  'PolicyManager',
  'ChainlinkPriceFeed',
  'AssetFinalityResolver',
];

export default fn;
