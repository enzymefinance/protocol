import { FundDeployerArgs, FundDeployer as FundDeployerContract } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');
  const gasRelayPaymasterFactory = await get('GasRelayPaymasterFactory');

  const fundDeployer = await deploy('FundDeployer', {
    args: [dispatcher.address, gasRelayPaymasterFactory.address] as FundDeployerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (fundDeployer.newlyDeployed) {
    const fundDeployerInstance = new FundDeployerContract(fundDeployer.address, deployer);
    const vaultCallValues = Object.values(config.vaultCalls);

    if (!!vaultCallValues.length) {
      const vaultCallContracts = vaultCallValues.map(([contract]) => contract);
      const vaultCallFunctionSigs = vaultCallValues.map(([, functionSig]) => functionSig);
      const vaultCallDataHashes = vaultCallValues.map(([, , dataHash]) => dataHash);
      log('Registering vault calls');
      await fundDeployerInstance.registerVaultCalls(vaultCallContracts, vaultCallFunctionSigs, vaultCallDataHashes);
    }
  }
};

fn.tags = ['Release', 'FundDeployer'];
fn.dependencies = ['Config', 'Dispatcher', 'GasRelayPaymasterFactory'];

export default fn;
