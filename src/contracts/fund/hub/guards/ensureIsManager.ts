import { Address } from '@melonproject/token-math/address';
import { ensure } from '~/utils/guards/ensure';
import { Environment } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

const ensureIsManager = async (address: Address, environment: Environment) => {
  const hubContract = getContract(Contracts.Hub, address, environment);
  const manager = await hubContract.methods.manager().call();
  ensure(
    manager.toLowerCase() === environment.wallet.address.toLowerCase(),
    `${address} is not manager of fund. Manager is ${manager}.`,
  );
};

export { ensureIsManager };
