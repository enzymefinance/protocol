import { callFactoryWithoutParams } from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { getFundFactory } from './getFundFactory';
import { getAmguToken } from '~/contracts/engine';
import { createQuantity } from '@melonproject/token-math/quantity';

const postProcess = async (result, prepared, environment) => {
  const fundFactoryAddress = await getFundFactory(prepared.contractAddress);
  const amguToken = await getAmguToken(fundFactoryAddress);
  const quantity = createQuantity(amguToken, result);
  return quantity;
};

const getAmguPrice = callFactoryWithoutParams(
  'getAmguPrice',
  Contracts.Version,
  { postProcess },
);

export { getAmguPrice };
