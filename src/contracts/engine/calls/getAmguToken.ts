import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { LogLevels } from '~/utils/environment/Environment';

const postProcess = async (environment, result) => {
  environment.logger('sadf', LogLevels.DEBUG, result);
  const token = await getToken(environment, result);
  return token;
};

const getAmguToken = callFactoryWithoutParams(
  'mlnToken',
  Contracts.AmguConsumer,
  {
    postProcess,
  },
);

export { getAmguToken };
