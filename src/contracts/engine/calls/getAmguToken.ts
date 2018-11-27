import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const postProcess = async (result, _, environment) => {
  const token = await getToken(result, environment);
  return token;
};

const getAmguToken = callFactoryWithoutParams(
  'mlnAddress',
  Contracts.AmguConsumer,
  {
    postProcess,
  },
);

export { getAmguToken };
