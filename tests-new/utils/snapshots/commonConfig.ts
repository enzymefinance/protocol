import { BuidlerProvider } from '@crestproject/crestproject';
import { ethers } from 'ethers';

// TODO: differentiate between common local config and e2e config (i.e., mainnet addresses)?
export async function commonConfigSnapshot(provider: BuidlerProvider) {
  const [
    deployer,
    manager,
    investor,
    maliciousUser,
    mtc,
    mgm,
    priceFeedUpdater,
  ] = await provider.listAccounts();

  return {
    accounts: {
      deployer,
      manager,
      investor,
      maliciousUser,
      mtc,
      mgm,
      priceFeedUpdater,
    },
    engine: {
      initialThawDelay: 2592000,
    },
    kyber: {
      maxSpread: ethers.utils.parseEther('0.1'),
      maxPriceDeviation: ethers.utils.parseEther('0.1'),
    },
  };
}
