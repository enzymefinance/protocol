import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const getEngine = callFactoryWithoutParams('engine', Contracts.AmguConsumer);

export { getEngine };
