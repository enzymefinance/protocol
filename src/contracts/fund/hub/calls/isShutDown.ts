import { callFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const isShutDown = callFactory('isShutDown', Contracts.Hub);

export { isShutDown };
