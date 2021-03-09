import { GuaranteedRedemption, IntegrationManager } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, all, log, getOrNull },
    ethers: { getSigners },
  } = hre;
  const deployer = (await getSigners())[0];
  const adapters = Object.values(await all())
    .filter((item) => item.linkedData?.type === 'ADAPTER')
    .map((item) => item.address.toLowerCase());

  if (adapters.length) {
    const integrationManager = await get('IntegrationManager');
    const integrationManagerInstance = new IntegrationManager(integrationManager.address, deployer);
    log('Registering adapters');
    await integrationManagerInstance.registerAdapters(adapters);
  }

  // Register synthetix as a redemption blocking adapter.
  const synthetixAdapter = await getOrNull('SynthetixAdapter');
  const guaranteedRedemption = await getOrNull('GuaranteedRedemption');
  if (synthetixAdapter !== null && guaranteedRedemption !== null) {
    const guaranteedRedemptionInstance = new GuaranteedRedemption(guaranteedRedemption.address, deployer);
    log('Registering redemption blocking adapters');
    await guaranteedRedemptionInstance.addRedemptionBlockingAdapters([synthetixAdapter.address]);
  }
};

fn.tags = ['Release', 'Adapters', 'RegisterAdapters'];
fn.dependencies = ['IntegrationManager'];
fn.runAtTheEnd = true;

export default fn;
