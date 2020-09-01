import { providers } from 'ethers';
import { deployPersistent } from './deployment';

export async function defaultTestDeployment(
  provider: providers.JsonRpcProvider,
) {
  const [deployer, mtc, mgm] = await provider.listAccounts();
  const config = {
    deployer: provider.getSigner(deployer),
    mgm,
    mtc,
  };

  const deployment = await deployPersistent(config);
  return { deployment, config };
}
