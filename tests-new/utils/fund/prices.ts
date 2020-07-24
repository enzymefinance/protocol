import { ethers } from 'ethers';
import { AddressLike, MockContract } from '@crestproject/crestproject';
import { IDerivativePriceSource } from '../../contracts/IDerivativePriceSource';
import { IPriceSource } from '../../contracts/IPriceSource';

export function mockDerivativeRate({
  mockDerivativePriceSource,
  derivative,
  underlyings,
  rates,
}: {
  mockDerivativePriceSource: MockContract<IDerivativePriceSource>;
  derivative: AddressLike;
  underlyings: AddressLike[];
  rates: ethers.BigNumberish[];
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
  rate: ethers.BigNumberish;
  rateIsValid?: boolean;
  lastUpdated?: number;
}) {
  return mockPriceSource.getCanonicalRate
    .given(baseAsset, quoteAsset)
    .returns(rate, rateIsValid, lastUpdated);
}
