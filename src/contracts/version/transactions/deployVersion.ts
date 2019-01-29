import { Address } from '@melonproject/token-math';
import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { Factories } from '~/utils/deploy/deploySystem';

interface VersionArgs {
  factories: Factories;
  registry: Address;
  postDeployOwner: Address;
}

export const deployVersion = async (
  environment: Environment,
  { factories, registry, postDeployOwner }: VersionArgs,
) => {
  const argsRaw = [
    factories.accountingFactory,
    factories.feeManagerFactory,
    factories.participationFactory,
    factories.sharesFactory,
    factories.tradingFactory,
    factories.vaultFactory,
    factories.policyManagerFactory,
    registry,
    postDeployOwner,
  ];

  const args = argsRaw.map(a => a.toString());

  const address = await deployContract(environment, Contracts.Version, args);

  return address;
};
