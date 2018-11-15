import { Address } from '@melonproject/token-math/address';
import { isShutDown } from '..';
import { ensure } from '~/utils/guards';
import { Environment } from '~/utils/environment';
import { getContract } from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { ContractAddress } from '~/utils';

const ensureIsManager = async (address: Address, environment: Environment) => {
  const hubContract = getContract(Contracts.Hub, address, environment);
  const manager = await hubContract.methods.manager().call();
  ensure(
    manager.toLowerCase() === environment.wallet.address.toLowerCase(),
    `${address} is not manager of fund. Manager is ${manager}.`,
  );
};

export { ensureIsManager };
