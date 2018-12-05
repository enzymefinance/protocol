import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getVersion } from '~/contracts/engine/calls/getVersion';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';

const postProcess = async (
  result,
  prepared,
  environment = getGlobalEnvironment(),
) => {
  const versionAddress = await getVersion(
    prepared.contractAddress,
    environment,
  );
  const amguToken = await getAmguToken(versionAddress, environment);
  const quantity = createQuantity(amguToken, result);
  return quantity;
};

const getAmguPrice = callFactoryWithoutParams(
  'getAmguPrice',
  Contracts.Version,
  { postProcess },
);

export { getAmguPrice };
