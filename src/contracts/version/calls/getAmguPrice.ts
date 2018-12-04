import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getVersion } from '~/contracts/engine/calls/getVersion';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createQuantity } from '@melonproject/token-math/quantity';

const postProcess = async (result, prepared, environment) => {
  const versionAddress = await getVersion(prepared.contractAddress);
  const amguToken = await getAmguToken(versionAddress);
  const quantity = createQuantity(amguToken, result);
  return quantity;
};

const getAmguPrice = callFactoryWithoutParams(
  'getAmguPrice',
  Contracts.Version,
  { postProcess },
);

export { getAmguPrice };
