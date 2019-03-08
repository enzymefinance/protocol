import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';

const getMembers = callFactoryWithoutParams(
  'getMembers',
  Contracts.AddressList,
);

export { getMembers };
