import { Address } from '@melonproject/token-math';
import { ensure } from '~/utils/guards/ensure';
import { Environment } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

const ensureIsManager = async (environment: Environment, address: Address) => {
  const hubContract = getContract(environment, Contracts.Hub, address);
  const manager = await hubContract.methods.manager().call();
  ensure(
    manager.toLowerCase() === environment.wallet.address.toLowerCase(),
    `${address} is not manager of fund. Manager is ${manager}.`,
  );
};

export { ensureIsManager };
