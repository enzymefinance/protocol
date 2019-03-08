import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';

const identifier = callFactoryWithoutParams('identifier', Contracts.Policy);

export { identifier };
