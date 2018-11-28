import { Address } from '@melonproject/token-math/address';
import { fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';

import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

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
  contractAddress,
  filter: OnTransferFilter,
  environment = getGlobalEnvironment(),
) => {
  const contract = getContract(
    Contracts.PreminedToken,
    contractAddress,
    environment,
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
