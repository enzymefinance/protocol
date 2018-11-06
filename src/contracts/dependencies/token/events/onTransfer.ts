import { Address } from '@melonproject/token-math/address';
import { fromEvent } from 'rxjs';

import { getGlobalEnvironment } from '~/utils/environment';
import { getContract, Contract } from '~/utils/solidity';

export interface OnTransferFilter {
  from: Address;
}

const onTransfer = (
  contractAddress,
  filter: OnTransferFilter,
  environment = getGlobalEnvironment(),
) => {
  const contract = getContract(
    Contract.PreminedToken,
    contractAddress,
    environment,
  );

  const eventEmitter = contract.events.Transfer({
    from: filter.from.toString(),
  });

  // TODO: Error handling
  return fromEvent(eventEmitter, 'data');
};

export { onTransfer };
