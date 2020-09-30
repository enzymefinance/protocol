import { ethers, utils } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { ERC20 } from '../../codegen/ERC20';
import { IDerivativePriceSource } from '../../codegen/IDerivativePriceSource';
import { IPriceSource } from '../../codegen/IPriceSource';
import { Registry } from '../../codegen/Registry';
import { ValueInterpreter } from '../../codegen/ValueInterpreter';
import {
  covertRateToValue,
  mockDerivativeRate,
  mockPrimitiveCanonicalRate,
  mockPrimitiveLiveRate,
} from '../utils/fund/prices';

async function deploy(provider: EthereumTestnetProvider) {
  const [deployer] = await provider.listAccounts();
  const signer = provider.getSigner(deployer);
  const mockAsset1 = await ERC20.mock(signer);
  const mockAsset2 = await ERC20.mock(signer);
  const mockAsset3 = await ERC20.mock(signer);
  const mockAsset4 = await ERC20.mock(signer);
  const mockDerivativePriceSource = await IDerivativePriceSource.mock(signer);
  const mockPriceSource = await IPriceSource.mock(signer);
  const mockRegistry = await Registry.mock(signer);
  const valueInterpreter = await ValueInterpreter.deploy(signer, mockRegistry);

  // Config mocks

  await mockRegistry.priceSource.returns(mockPriceSource);

  // Set all assets as unregistered and give standard decimals
  for (const asset of [mockAsset1, mockAsset2, mockAsset3, mockAsset4]) {
    await mockRegistry.primitiveIsRegistered.given(asset).returns(false);

    await mockRegistry.derivativeToPriceSource
      .given(asset)
      .returns(ethers.constants.AddressZero);

    await asset.decimals.returns(18);
  }

  // Config vars

  const defaultCalcValueParams = {
    baseAsset: mockAsset1,
    baseAmount: utils.parseEther('1'),
    quoteAsset: mockAsset2,
    primitivePerUnderlyingRate: utils.parseEther('1.5'),
    quotePerPrimitiveRate: utils.parseEther('0.5'),
    underlyingPerDerivativeRate: utils.parseEther('0.25'),
  };

  return {
    defaultCalcValueParams,
    deployer,
    mockAsset3,
    mockAsset4,
    mockDerivativePriceSource,
    mockPriceSource,
    mockRegistry,
    valueInterpreter,
  };
}

let tx, res;

describe('ValueInterpreter', () => {
  describe('calcCanonicalAssetValue', () => {
    it('uses canonical rate', async () => {
      const {
        defaultCalcValueParams,
        mockPriceSource,
        mockRegistry,
        valueInterpreter,
      } = await provider.snapshot(deploy);

      const {
        baseAsset,
        baseAmount,
        quoteAsset,
        quotePerPrimitiveRate,
      } = defaultCalcValueParams;

      await mockPrimitiveCanonicalRate({
        mockPriceSource,
        baseAsset,
        quoteAsset,
        rate: quotePerPrimitiveRate,
      });

      await mockRegistry.primitiveIsRegistered.given(baseAsset).returns(true);

      res = await valueInterpreter.calcCanonicalAssetValue
        .args(baseAsset, baseAmount, quoteAsset)
        .call();

      expect(mockPriceSource.getLiveRate).not.toHaveBeenCalledOnContract();
      expect(mockPriceSource.getCanonicalRate).toHaveBeenCalledOnContract();

      await expect(
        mockPriceSource.getCanonicalRate.ref,
      ).toHaveBeenCalledOnContractWith(baseAsset, quoteAsset);
    });

    it('returns zeroed values when base asset not in registry', async () => {
      const {
        defaultCalcValueParams,
        mockPriceSource,
        mockRegistry,
        valueInterpreter,
      } = await provider.snapshot(deploy);

      const {
        baseAsset,
        baseAmount,
        quoteAsset,
        quotePerPrimitiveRate,
      } = defaultCalcValueParams;

      await mockPrimitiveCanonicalRate({
        mockPriceSource,
        baseAsset,
        quoteAsset,
        rate: quotePerPrimitiveRate,
      });

      res = await valueInterpreter.calcCanonicalAssetValue
        .args(baseAsset, baseAmount, quoteAsset)
        .call();

      expect(res.value_).toEqBigNumber(0);
      expect(res.isValid_).toBeFalsy();

      // Register baseAsset as primitive
      await mockRegistry.primitiveIsRegistered.given(baseAsset).returns(true);

      res = await valueInterpreter.calcCanonicalAssetValue
        .args(baseAsset, baseAmount, quoteAsset)
        .call();

      const expectedQuoteAssetAmount = await covertRateToValue(
        baseAsset,
        baseAmount,
        quotePerPrimitiveRate,
      );

      expect(res.value_).toEqBigNumber(expectedQuoteAssetAmount);

      expect(res.isValid_).toBeTruthy();
    });
  });

  describe('calcCanonicalAssetValue: derivative', () => {
    describe('1 underlying primitive', () => {
      it('returns a valid rate', async () => {
        const {
          defaultCalcValueParams,
          mockAsset3,
          mockDerivativePriceSource,
          mockPriceSource,
          mockRegistry,
          valueInterpreter,
        } = await provider.snapshot(deploy);

        const {
          baseAsset,
          baseAmount,
          quoteAsset,
          quotePerPrimitiveRate,
          underlyingPerDerivativeRate,
        } = defaultCalcValueParams;
        const underlying = mockAsset3;

        // baseAsset must be registered as derivative, and underlying must be registered as primitive
        await mockRegistry.derivativeToPriceSource
          .given(baseAsset)
          .returns(mockDerivativePriceSource.address);

        await mockRegistry.primitiveIsRegistered
          .given(underlying)
          .returns(true);

        // Set rates for:
        // - baseAsset-to-underlying
        // - underlying-to-quoteAsset
        await mockDerivativeRate({
          mockDerivativePriceSource,
          derivative: baseAsset,
          underlyings: [underlying],
          rates: [underlyingPerDerivativeRate],
        });

        await mockPrimitiveCanonicalRate({
          mockPriceSource,
          baseAsset: underlying,
          quoteAsset,
          rate: quotePerPrimitiveRate,
        });

        // Test that rate is the underlying asset value.
        res = await valueInterpreter.calcCanonicalAssetValue
          .args(baseAsset, baseAmount, quoteAsset)
          .call();

        expect(res.isValid_).toBeTruthy();

        const expectedUnderlyingAmount = await covertRateToValue(
          baseAsset,
          baseAmount,
          underlyingPerDerivativeRate,
        );
        const expectedQuoteAssetAmount = await covertRateToValue(
          underlying,
          expectedUnderlyingAmount,
          quotePerPrimitiveRate,
        );
        expect(res.value_).toEqBigNumber(expectedQuoteAssetAmount);
      });

      it.todo('handles un-registered underlying asset');
      it.todo('handles invalid rate of underlying asset');
      it.todo('handles empty rate');
    });

    // E.g., WETH <-> DAI Uniswap LP tokens
    describe('2 underlying primitives', () => {
      it('returns a valid rate', async () => {
        const {
          defaultCalcValueParams,
          mockAsset3,
          mockAsset4,
          mockDerivativePriceSource,
          mockPriceSource,
          mockRegistry,
          valueInterpreter,
        } = await provider.snapshot(deploy);

        const {
          baseAsset,
          baseAmount,
          quoteAsset,
          quotePerPrimitiveRate,
          underlyingPerDerivativeRate,
        } = defaultCalcValueParams;
        const underlying1 = mockAsset3;
        const underlying2 = mockAsset4;

        // The baseAsset must be registered as a derivative, and both underlyings must be registered as primitives,
        // to provide the expected path from baseAsset (derivative) -> primitives -> quoteAsset
        await mockRegistry.derivativeToPriceSource
          .given(baseAsset)
          .returns(mockDerivativePriceSource.address);

        await mockRegistry.primitiveIsRegistered
          .given(underlying1)
          .returns(true);

        await mockRegistry.primitiveIsRegistered
          .given(underlying2)
          .returns(true);

        // Set rates for:
        // - baseAsset-to-underlying
        // - underlying1-to-quoteAsset
        // - underlying2-to-quoteAsset
        const underlyingPerDerivativeRate2 = underlyingPerDerivativeRate.div(2);
        await mockDerivativeRate({
          mockDerivativePriceSource,
          derivative: baseAsset,
          underlyings: [underlying1, underlying2],
          rates: [underlyingPerDerivativeRate, underlyingPerDerivativeRate2],
        });

        await mockPrimitiveCanonicalRate({
          mockPriceSource,
          baseAsset: underlying1,
          quoteAsset,
          rate: quotePerPrimitiveRate,
        });

        const quotePerPrimitiveRate2 = quotePerPrimitiveRate.div(10);
        await mockPrimitiveCanonicalRate({
          mockPriceSource,
          baseAsset: underlying2,
          quoteAsset,
          rate: quotePerPrimitiveRate2,
        });

        // Test that rate is the sum of the underlying asset values.
        res = await valueInterpreter.calcCanonicalAssetValue
          .args(baseAsset, baseAmount, quoteAsset)
          .call();

        expect(res.isValid_).toBeTruthy();

        const expectedUnderlying1Amount = await covertRateToValue(
          baseAsset,
          baseAmount,
          underlyingPerDerivativeRate,
        );
        const expectedQuoteAssetAmount1 = await covertRateToValue(
          underlying1,
          expectedUnderlying1Amount,
          quotePerPrimitiveRate,
        );

        const expectedUnderlying2Amount = await covertRateToValue(
          baseAsset,
          baseAmount,
          underlyingPerDerivativeRate2,
        );
        const expectedQuoteAssetAmount2 = await covertRateToValue(
          underlying2,
          expectedUnderlying2Amount,
          quotePerPrimitiveRate2,
        );

        expect(res.value_).toEqBigNumber(
          expectedQuoteAssetAmount1.add(expectedQuoteAssetAmount2),
        );
      });
    });

    // E.g., wrappedCDai -> cDai -> Dai
    describe('1 underlying derivative with recursion', () => {
      it.todo('uses getRatesToUnderlyings for derivative');

      it('returns a valid rate', async () => {
        const {
          defaultCalcValueParams,
          mockAsset3,
          mockAsset4,
          mockDerivativePriceSource,
          mockPriceSource,
          mockRegistry,
          valueInterpreter,
        } = await provider.snapshot(deploy);

        const {
          baseAsset,
          baseAmount,
          quoteAsset,
          quotePerPrimitiveRate,
          underlyingPerDerivativeRate,
        } = defaultCalcValueParams;
        const underlying1 = mockAsset3;
        const underlying2 = mockAsset4;

        // The baseAsset must be registered as a derivative, underlying1 must be registered as a derivative, and underlying2 must be registered as a primitive.
        // This provides the expected path from baseAsset (derivative) -> derivative2 -> primitive -> quoteAsset
        await mockRegistry.derivativeToPriceSource
          .given(baseAsset)
          .returns(mockDerivativePriceSource.address);

        await mockRegistry.derivativeToPriceSource
          .given(underlying1)
          .returns(mockDerivativePriceSource.address);

        await mockRegistry.primitiveIsRegistered
          .given(underlying2)
          .returns(true);

        // Set rates for:
        // - baseAsset-to-underlying1
        // - underlying1-to-underlying2
        // - underlying2-to-quoteAsset
        await mockDerivativeRate({
          mockDerivativePriceSource,
          derivative: baseAsset,
          underlyings: [underlying1],
          rates: [underlyingPerDerivativeRate],
        });

        const underlyingPerDerivativeRate2 = underlyingPerDerivativeRate.div(2);
        await mockDerivativeRate({
          mockDerivativePriceSource,
          derivative: underlying1,
          underlyings: [underlying2],
          rates: [underlyingPerDerivativeRate2],
        });

        await mockPrimitiveCanonicalRate({
          mockPriceSource,
          baseAsset: underlying2,
          quoteAsset,
          rate: quotePerPrimitiveRate,
        });

        // Test that rate is the sum of the underlying asset values.
        res = await valueInterpreter.calcCanonicalAssetValue
          .args(baseAsset, baseAmount, quoteAsset)
          .call();

        expect(res.isValid_).toBeTruthy();

        const expectedUnderlying1Amount = await covertRateToValue(
          baseAsset,
          baseAmount,
          underlyingPerDerivativeRate,
        );
        const expectedUnderlying2Amount = await covertRateToValue(
          underlying1,
          expectedUnderlying1Amount,
          underlyingPerDerivativeRate2,
        );
        const expectedQuoteAssetAmount = await covertRateToValue(
          underlying2,
          expectedUnderlying2Amount,
          quotePerPrimitiveRate,
        );

        expect(res.value_).toEqBigNumber(expectedQuoteAssetAmount);
      });
    });

    describe('2 underlying derivatives with recursion', () => {
      it.todo('same tests as above');
    });
  });

  describe('calcLiveAssetValue', () => {
    it('uses live rate', async () => {
      const {
        defaultCalcValueParams,
        mockPriceSource,
        mockRegistry,
        valueInterpreter,
      } = await provider.snapshot(deploy);

      const {
        baseAsset,
        baseAmount,
        quoteAsset,
        quotePerPrimitiveRate,
      } = defaultCalcValueParams;

      await mockPrimitiveLiveRate({
        mockPriceSource,
        baseAsset,
        quoteAsset,
        rate: quotePerPrimitiveRate,
      });

      await mockRegistry.primitiveIsRegistered.given(baseAsset).returns(true);

      res = await valueInterpreter.calcLiveAssetValue
        .args(baseAsset, baseAmount, quoteAsset)
        .call();

      expect(mockPriceSource.getLiveRate).toHaveBeenCalledOnContract();
      expect(mockPriceSource.getCanonicalRate).not.toHaveBeenCalledOnContract();

      await expect(
        mockPriceSource.getLiveRate.ref,
      ).toHaveBeenCalledOnContractWith(baseAsset, quoteAsset);
    });
  });
});
