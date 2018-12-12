import { Address } from '@melonproject/token-math/address';
import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { Factories } from '~/utils/deploy/deploySystem';
import { TokenInterface } from '@melonproject/token-math/token';

interface VersionArgs {
  engine: Address;
  factories: Factories;
  mlnToken: TokenInterface;
  priceSource: Address;
  registry: Address;
}

export const deployVersion = async (
  environment: Environment,
  { factories, engine, mlnToken, priceSource, registry }: VersionArgs,
) => {
  const argsRaw = [
    factories.accountingFactory,
    factories.feeManagerFactory,
    factories.participationFactory,
    factories.sharesFactory,
    factories.tradingFactory,
    factories.vaultFactory,
    factories.policyManagerFactory,
    engine,
    priceSource,
    mlnToken.address,
    registry,
  ];

  const args = argsRaw.map(a => a.toString());

  const address = await deployContract(environment, Contracts.Version, args);

  return address;
};
