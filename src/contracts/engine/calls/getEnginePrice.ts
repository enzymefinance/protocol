import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { createPrice, createQuantity } from '@melonproject/token-math';

const postProcess = async (environment, result, prepared) => {
  const engineAddress = prepared.contractAddress;
  const amguToken = await getAmguToken(environment, engineAddress);
  const enginePrice = createPrice(
    createQuantity(amguToken, 1),
    createQuantity('ETH', result),
  );
  return enginePrice;
};

const getEnginePrice = callFactoryWithoutParams(
  'enginePrice',
  Contracts.Engine,
  { postProcess },
);

export { getEnginePrice };
