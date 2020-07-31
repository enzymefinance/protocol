import { BigNumber, BigNumberish } from 'ethers';
import { AddressLike, MockContract } from '@crestproject/crestproject';
import { ERC20WithFields } from '../../contracts/codegen/ERC20WithFields';
import { IDerivativePriceSource } from '../../contracts/codegen/IDerivativePriceSource';
import { IPriceSource } from '../../contracts/codegen/IPriceSource';

export function mockDerivativeRate({
  mockDerivativePriceSource,
  derivative,
  underlyings,
  rates,
}: {
  mockDerivativePriceSource: MockContract<IDerivativePriceSource>;
  derivative: AddressLike;
  underlyings: AddressLike[];
  rates: BigNumberish[];
}) {
  return mockDerivativePriceSource.getRatesToUnderlyings
    .given(derivative)
    .returns(underlyings, rates);
}

export function mockPrimitiveCanonicalRate({
  mockPriceSource,
  baseAsset,
  quoteAsset,
  rate,
  rateIsValid = true,
  lastUpdated = Math.floor(new Date().getTime() / 1000),
}: {
  mockPriceSource: MockContract<IPriceSource>;
  baseAsset: AddressLike;
  quoteAsset: AddressLike;
  rate: BigNumberish;
  rateIsValid?: boolean;
  lastUpdated?: number;
}) {
  return mockPriceSource.getCanonicalRate
    .given(baseAsset, quoteAsset)
    .returns(rate, rateIsValid, lastUpdated);
}

export function mockPrimitiveLiveRate({
  mockPriceSource,
  baseAsset,
  quoteAsset,
  rate,
  rateIsValid = true,
}: {
  mockPriceSource: MockContract<IPriceSource>;
  baseAsset: AddressLike;
  quoteAsset: AddressLike;
  rate: BigNumberish;
  rateIsValid?: boolean;
}) {
  return mockPriceSource.getLiveRate
    .given(baseAsset, quoteAsset)
    .returns(rate, rateIsValid);
}

export async function covertRateToValue(
  baseAsset: MockContract<ERC20WithFields> | ERC20WithFields,
  amount: BigNumberish,
  rate: BigNumberish,
) {
  return BigNumber.from(rate)
    .mul(amount)
    .div(BigNumber.from(10).pow(await baseAsset.decimals()));
}
