import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const postProcess = async (
  result,
  prepared,
  environment,
): Promise<QuantityInterface> => {
  const fundToken = await getToken(result, environment);
  return fundToken;
};

const getQuoteToken = callFactoryWithoutParams(
  'QUOTE_ASSET',
  Contracts.Accounting,
  {
    postProcess,
  },
);

export { getQuoteToken };
