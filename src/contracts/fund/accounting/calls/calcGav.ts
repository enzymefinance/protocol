import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getDenominationAsset } from './getDenominationAsset';
import {
  createQuantity,
  QuantityInterface,
} from '@melonproject/token-math/quantity';

type CalcGavResult = QuantityInterface;

const postProcess = async (
  environment,
  result,
  prepared,
): Promise<CalcGavResult> => {
  const quoteToken = await getDenominationAsset(
    environment,
    prepared.contractAddress,
  );

  const gav = createQuantity(quoteToken, result);

  return gav;
};

const calcGav = callFactoryWithoutParams('calcGav', Contracts.Accounting, {
  postProcess,
});

export { calcGav };
