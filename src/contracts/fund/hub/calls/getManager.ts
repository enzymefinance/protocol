import { callFactoryWithoutParams } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const getManager = callFactoryWithoutParams('manager', Contracts.Spoke);

export { getManager };
