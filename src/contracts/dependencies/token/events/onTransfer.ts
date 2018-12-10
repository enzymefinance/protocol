import { Address } from '@melonproject/token-math/address';
import { fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export interface OnTransferFilter {
  from: Address;
}

interface ReturnValues {
  from: string;
  to: string;
  value: string;
}
interface Log {
  returnValues: ReturnValues;
}

const onTransfer = (
  environment: Environment,
  contractAddress: Address,
  filter: OnTransferFilter,
) => {
  const contract = getContract(
    environment,
    Contracts.PreminedToken,
    contractAddress,
  );

  const eventEmitter = contract.events.Transfer({
    from: filter.from.toString(),
  });

  // TODO: Error handling
  return fromEvent<Log>(eventEmitter, 'data').pipe(
    map(log => ({
      from: log.returnValues.from,
      to: log.returnValues.to,
      value: log.returnValues.value,
    })),
  );
};

export { onTransfer };
