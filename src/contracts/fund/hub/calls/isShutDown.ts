import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const isShutDown = callFactory('isShutDown', Contracts.Hub);

export { isShutDown };
