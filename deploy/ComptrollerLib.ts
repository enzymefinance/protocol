import { DeployFunction } from 'hardhat-deploy/types';
import { FundDeployer as FundDeployerContract, ComptrollerLibArgs } from '@melonproject/protocol';
import { loadConfig } from './Config';
import { sameAddress } from '@crestproject/crestproject';

const fn: DeployFunction = async function (hre) {
  const { deploy, get, log } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const config = await loadConfig(hre);

  const dispatcher = await get('Dispatcher');
  const fundDeployer = await get('FundDeployer');
  const valueInterpreter = await get('ValueInterpreter');
  const feeManager = await get('FeeManager');
  const integrationManager = await get('IntegrationManager');
  const policyManager = await get('PolicyManager');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');
  const synthetixPriceFeed = await get('SynthetixPriceFeed');

  const comptrollerLib = await deploy('ComptrollerLib', {
    from: deployer.address,
    log: true,
    args: [
      dispatcher.address,
      fundDeployer.address,
      valueInterpreter.address,
      feeManager.address,
      integrationManager.address,
      policyManager.address,
      chainlinkPriceFeed.address,
      synthetixPriceFeed.address,
      config.synthetix.addressResolver,
    ] as ComptrollerLibArgs,
  });

  const fundDeployerInstance = new FundDeployerContract(fundDeployer.address, deployer);
  const currentComptrollerLib = await fundDeployerInstance.getComptrollerLib();
  if (!sameAddress(currentComptrollerLib, comptrollerLib.address)) {
    log(`Updating ComptrollerLib on FundDeployer from ${currentComptrollerLib} to ${comptrollerLib.address}`);
    await fundDeployerInstance.setComptrollerLib(comptrollerLib.address);
  } else {
    log('ComptrollerLib on FundDeployer already set');
  }
};

fn.tags = ['Release', 'ComptrollerLib'];
fn.dependencies = [
  'Config',
  'Dispatcher',
  'FundDeployer',
  'FeeManager',
  'PolicyManager',
  'IntegrationManager',
  'Prices',
];

export default fn;
