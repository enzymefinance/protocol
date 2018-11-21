import { callFactoryWithoutParams } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const getVersion = callFactoryWithoutParams('version', Contracts.AmguConsumer);

export { getVersion };
