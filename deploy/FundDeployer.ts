import { DeployFunction } from 'hardhat-deploy/types';
import { Dispatcher, FundDeployerArgs } from '@enzymefinance/protocol';
import { sameAddress } from '@crestproject/crestproject';

const fn: DeployFunction = async function (hre) {
  const { deploy, get, log } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');

  const dispatcher = await get('Dispatcher');
  const vaultLib = await get('VaultLib');

  const fundDeployer = await deploy('FundDeployer', {
    from: deployer.address,
    log: true,
    // NOTE: Registration of vault contract calls is done in the adapter deployment phase.
    args: [dispatcher.address, vaultLib.address, [], []] as FundDeployerArgs,
  });

  if (!hre.network.live || hre.network.name === 'kovan') {
    // Set the current fund deployer on the dispatcher but only for test deployments. On
    // mainnet, this is part of the hand over / release routine.
    const dispatcherInstance = new Dispatcher(dispatcher.address, deployer);
    const currentFundDeployer = await dispatcherInstance.getCurrentFundDeployer();
    if (!sameAddress(currentFundDeployer, fundDeployer.address)) {
      log('Setting the fund deployer on the dispatcher');
      await dispatcherInstance.setCurrentFundDeployer(fundDeployer.address);
    } else {
      log('The fund deployer has already been set');
    }
  }
};

fn.tags = ['Release', 'FundDeployer'];
fn.dependencies = ['Dispatcher', 'VaultLib'];

export default fn;
