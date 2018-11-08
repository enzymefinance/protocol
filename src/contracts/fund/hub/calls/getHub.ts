import { callFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const getHub = callFactory('getHub', Contracts.Spoke);

export { getHub };
