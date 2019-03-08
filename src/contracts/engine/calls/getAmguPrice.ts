import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createQuantity } from '@melonproject/token-math';

const postProcess = async (environment, result, prepared) => {
  const engineAddress = prepared.contractAddress;
  const amguToken = await getAmguToken(environment, engineAddress);
  const quantity = createQuantity(amguToken, result);
  return quantity;
};

const getAmguPrice = callFactoryWithoutParams(
  'getAmguPrice',
  Contracts.Engine,
  { postProcess },
);

export { getAmguPrice };
