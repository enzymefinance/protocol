// import { IPriceSource } from '../../contracts/IPriceSource';
import { ethers } from 'ethers';

interface MockDerivativeRateParams {
  mockDerivativePriceSource: any; // TODO: how can we get mocked IDerivativePriceSource typed?
  derivative: string;
  underlyings: string[];
  rates: ethers.BigNumberish[];
}

interface MockPrimitiveCanonicalRateParams {
  mockPriceSource: any; // TODO: how can we get mocked IPriceSource typed?
  baseAsset: string;
  quoteAsset: string;
  rate: ethers.BigNumberish;
  rateIsValid?: boolean;
  lastUpdated?: number;
}

export async function mockDerivativeRate({
  mockDerivativePriceSource,
  derivative,
  underlyings,
  rates,
}: MockDerivativeRateParams) {
  return await mockDerivativePriceSource
    .getRatesToUnderlyings(derivative)
    .returns(underlyings, rates);
}

export async function mockPrimitiveCanonicalRate({
  mockPriceSource,
  baseAsset,
  quoteAsset,
  rate,
  rateIsValid = true,
  lastUpdated = Math.floor(new Date().getTime() / 1000),
}: MockPrimitiveCanonicalRateParams) {
  return await mockPriceSource
    .getCanonicalRate(baseAsset, quoteAsset)
    .returns(rate, rateIsValid, lastUpdated);
}
