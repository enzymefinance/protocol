import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const getVersion = callFactoryWithoutParams('version', Contracts.AmguConsumer);

export { getVersion };
