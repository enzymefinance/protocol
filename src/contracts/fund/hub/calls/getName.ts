import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';

const getName = callFactoryWithoutParams('name', Contracts.Hub);

export { getName };
