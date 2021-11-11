import { GuaranteedRedemptionPolicy } from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { log, getOrNull },
    ethers: { getSigners },
  } = hre;
  const deployer = (await getSigners())[0];

  // Register synthetix as a redemption blocking adapter.
  const synthetixAdapter = await getOrNull('SynthetixAdapter');
  const guaranteedRedemption = await getOrNull('GuaranteedRedemptionPolicy');
  if (synthetixAdapter !== null && guaranteedRedemption !== null) {
    const guaranteedRedemptionInstance = new GuaranteedRedemptionPolicy(guaranteedRedemption.address, deployer);
    log('Registering redemption blocking adapters');
    await guaranteedRedemptionInstance.addRedemptionBlockingAdapters([synthetixAdapter.address]);
  }
};

fn.tags = ['Release', 'Adapters', 'RegisterAdapters'];
fn.dependencies = ['GuaranteedRedemptionPolicy', 'SynthetixAdapter'];
fn.runAtTheEnd = true;

export default fn;
