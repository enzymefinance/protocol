import { ethers } from 'ethers';
import { AddressLike, MockContract } from '@crestproject/crestproject';
import { ERC20WithFields } from '../../contracts/ERC20WithFields';
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
  rate: ethers.BigNumberish;
  rateIsValid?: boolean;
}) {
  return mockPriceSource.getLiveRate
    .given(baseAsset, quoteAsset)
    .returns(rate, rateIsValid);
}

export async function covertRateToValue(
  baseAsset: MockContract<ERC20WithFields> | ERC20WithFields,
  amount: ethers.BigNumberish,
  rate: ethers.BigNumberish,
) {
  return ethers.BigNumber.from(rate)
    .mul(amount)
    .div(ethers.BigNumber.from(10).pow(await baseAsset.decimals()));
}
