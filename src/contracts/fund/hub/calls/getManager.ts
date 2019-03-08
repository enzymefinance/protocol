import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';

const getManager = callFactoryWithoutParams('manager', Contracts.Hub);

export { getManager };
