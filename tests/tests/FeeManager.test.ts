import { BuidlerProvider } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';
import { dummyFee, setupFundWithParams } from '../utils';
import { IFee } from '../codegen/IFee';

let tx;

async function snapshot(provider: BuidlerProvider) {
  const deployment = await configureTestDeployment()(provider);
  const {
    system: { fundFactory, registry },
    config: {
      deployer,
      tokens: { weth },
    },
  } = deployment;

  const mockFee = await IFee.mock(deployer);
  await mockFee.identifier.returns('MOCK');
  await mockFee.feeHook.returns(2); // Continuous fee
  await mockFee.addFundSettings.returns('');
  await registry.registerFee(mockFee);

  const fund = await setupFundWithParams({
    factory: fundFactory,
    manager: deployer,
    denominationAsset: weth,
    fees: [await dummyFee(mockFee.address)],
  });

  return { ...deployment, fund, mockFee };
}

describe('FeeManager', () => {
  describe('enableFees', () => {
    // TODO: All these tests should be done with a FeeManager mock.
    it.todo('does not allow an empty fees array');
    it.todo('does not allow uneven fees and settings arrays');
    it.todo('does not allow an un-registered fee');
    it.todo('does not allow an already enabled fee');

    // Called by FundFactory on fund deployment, but could also do this with a mock.
    // TODO: need to do a mock FeeManager if we want to test the event.
    it('enables only the specified fee', async () => {
      const {
        fund: { feeManager },
        mockFee,
      } = await provider.snapshot(snapshot);

      tx = feeManager.feeIsEnabled(mockFee);
      await expect(tx).resolves.toBe(true);

      tx = await feeManager.getEnabledFees();
      expect(tx.length).toBe(1);
      expect(tx[0]).toBe(mockFee.address);
    });
  });

  // Note: It may be easier to test most of these with `settleContinuousFees` for the time being,
  // due to ease of access control (don't need to call from Shares)
  describe('settleFees', () => {
    it.todo('is only callable by Shares');
    it.todo('is only callable for an active fund');
    it.todo('only calls fees of the specified FeeHook');
    it.todo('only calls fees of the specified FeeHook');

    it.todo(
      'calls Fee.payoutSharesOutstanding even if there are 0 shares due from Fee.settle',
    );
  });

  describe('__distributeSharesDue', () => {
    it.todo('returns if the _payer and _payee are the same');
    it.todo('only burns _payer shares if _payee is Shares');
    it.todo('only mints shares to _payee if _payer is Shares');
    it.todo(
      'burns _payer shares and mints _payee shares if neither _payer nor _payee is Shares',
    );
  });

  describe('__payoutFeeSharesOutstanding', () => {
    it.todo('calls payoutSharesOutstanding on the Fee');
    it.todo(
      'does not attempt to distribute fees or emit event if no shares are due',
    );
    it.todo('emits FeeSharesOutstandingPaid with correct return values');
  });

  describe('__settleFee', () => {
    it.todo('calls settle on the Fee with the proper args');
    it.todo(
      'does not attempt to distribute fees or emit event if no shares are due',
    );
    it.todo('emits FeeSettled with correct return values');
  });
});
