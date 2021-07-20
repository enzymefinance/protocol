import { GuaranteedRedemption } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { log, getOrNull },
    ethers: { getSigners },
  } = hre;
  const deployer = (await getSigners())[0];

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
fn.dependencies = ['GuaranteedRedemption', 'SynthetixAdapter'];
fn.runAtTheEnd = true;

export default fn;
