import { BuidlerProvider } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { ERC20WithFields } from '../contracts/ERC20WithFields';
import { IDerivativePriceSource } from '../contracts/IDerivativePriceSource';
import { IPriceSource } from '../contracts/IPriceSource';
import { Registry } from '../contracts/Registry';
import { ValueInterpreter } from '../contracts/ValueInterpreter';
import {
  mockDerivativeRate,
  mockPrimitiveCanonicalRate,
} from '../utils/fund/prices';

async function deploy(provider: BuidlerProvider) {
  const [deployer] = await provider.listAccounts();
  const signer = provider.getSigner(deployer);
  const mockBaseAsset = await ERC20WithFields.mock(signer);
  const mockQuoteAsset = await ERC20WithFields.mock(signer);
  const mockAsset3 = await ERC20WithFields.mock(signer);
  const mockDerivativePriceSource = await IDerivativePriceSource.mock(signer);
  const mockPriceSource = await IPriceSource.mock(signer);
  const mockRegistry = await Registry.mock(signer);
  const valueInterpreter = await ValueInterpreter.deploy(
    signer,
    mockRegistry.contract.address,
  );

  // Config mockRegistry
  await mockRegistry.priceSource().returns(mockPriceSource.contract.address);

  // Config mockAssets
  await mockBaseAsset.decimals().returns(18);
  await mockAsset3.decimals().returns(18);

  // Config vars
  const defaultCalcValueParams = {
    baseAsset: mockBaseAsset.contract.address,
    baseAmount: ethers.utils.parseEther('1'),
    quoteAsset: mockQuoteAsset.contract.address,
    primitivePerUnderlyingRate: ethers.utils.parseEther('1.5'),
    quotePerPrimitiveRate: ethers.utils.parseEther('0.5'),
    underlyingPerDerivativeRate: ethers.utils.parseEther('0.25'),
  };

  return {
    defaultCalcValueParams,
    deployer,
    mockAsset3,
    mockDerivativePriceSource,
    mockPriceSource,
    mockRegistry,
    valueInterpreter,
  };
}

let tx, res;

describe('ValueInterpreter', () => {
  // TODO: how many of the same tests need to be run with the live rate?
  describe('calcLiveAssetValue', () => {
    it.todo('define tests');
  });

  describe('calcCanonicalAssetValue', () => {
    it('uses getCanonicalRate for primitive', async () => {
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

      await mockRegistry.primitiveIsRegistered(baseAsset).returns(true);
      res = await valueInterpreter.calcCanonicalAssetValue
        .args(baseAsset, baseAmount, quoteAsset)
        .call();

      // TODO: temp assertion until below fixed
      expect(res.isValid_).toBeTruthy();

      // expect(
      //   mockPriceSource.contract.getCanonicalRate,
      // ).toHaveBeenCalledOnContractTimes(1);
      // expect(
      //   mockPriceSource.contract.getCanonicalRate,
      // ).toHaveBeenCalledOnContractWith(mockAsset1, mockAsset2);
    });

    it.todo('uses getCanonicalRate for derivative');

    it.todo('uses getRatesToUnderlyings for derivative');

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

      // Set baseAsset to unregistered
      await mockRegistry.primitiveIsRegistered(baseAsset).returns(false);
      await mockRegistry
        .derivativeToPriceSource(baseAsset)
        .returns(ethers.constants.AddressZero);
      res = await valueInterpreter.calcCanonicalAssetValue
        .args(baseAsset, baseAmount, quoteAsset)
        .call();
      expect(res.value_).toEqBigNumber(0);
      expect(res.isValid_).toBeFalsy();

      // Register baseAsset as primitive
      await mockRegistry.primitiveIsRegistered(baseAsset).returns(true);
      res = await valueInterpreter.calcCanonicalAssetValue
        .args(baseAsset, baseAmount, quoteAsset)
        .call();
      expect(res.value_).toEqBigNumber(quotePerPrimitiveRate);
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
        const underlying = mockAsset3.contract.address;

        // baseAsset must be registered as derivative, and underlying must be registered as primary
        await mockRegistry.primitiveIsRegistered(baseAsset).returns(false);
        await mockRegistry
          .derivativeToPriceSource(baseAsset)
          .returns(mockDerivativePriceSource.contract.address);
        await mockRegistry.primitiveIsRegistered(underlying).returns(true);

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

        res = await valueInterpreter.calcCanonicalAssetValue
          .args(baseAsset, baseAmount, quoteAsset)
          .call();
        expect(res.isValid_).toBeTruthy();
        // TODO: replace with asset decimals
        expect(res.value_).toEqBigNumber(
          underlyingPerDerivativeRate
            .mul(quotePerPrimitiveRate)
            .div(ethers.BigNumber.from(10).pow(18)),
        );
      });

      it.todo('handles un-registered underlying asset');
      it.todo('handles invalid rate of underlying asset');
      it.todo('handles empty rate');
    });

    describe('2 underlying primitives', () => {});

    describe('1 underlying derivative with recursion', () => {});

    describe('2 underlying derivatives with recursion', () => {});
  });
});
