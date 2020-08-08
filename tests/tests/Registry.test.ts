import { utils } from 'ethers';
import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';
import { IFee } from '../codegen/IFee';

let tx;

async function snapshot(provider: BuidlerProvider) {
  const deployment = await configureTestDeployment()(provider);
  const {
    config: { deployer },
  } = deployment;

  const mockFee = await IFee.mock(deployer);
  await mockFee.identifier.returns('MOCK');
  await mockFee.feeHook.returns(1);

  return { ...deployment, mockFee };
}

describe('Registry', () => {
  describe('constructor', () => {
    it('MTC is set', async () => {
      const {
        system: { registry },
        config: {
          owners: { mtc },
        },
      } = await provider.snapshot(snapshot);

      tx = registry.MTC();
      await expect(tx).resolves.toBe(mtc);
    });

    it('MGM is set', async () => {
      const {
        system: { registry },
        config: {
          owners: { mgm },
        },
      } = await provider.snapshot(snapshot);

      tx = registry.MGM();
      await expect(tx).resolves.toBe(mgm);
    });

    it('check mln is set', async () => {
      const {
        system: { registry },
        config: {
          tokens: { mln },
        },
      } = await provider.snapshot(snapshot);

      tx = registry.MLN_TOKEN();
      await expect(tx).resolves.toBe(mln.address);
    });

    it('check weth is set', async () => {
      const {
        system: { registry },
        config: { weth },
      } = await provider.snapshot(snapshot);

      tx = registry.WETH_TOKEN();
      await expect(tx).resolves.toBe(weth.address);
    });
  });

  describe('transferOwnership', () => {
    it('can only be called by owner', async () => {
      const {
        system: { registry },
        config: {
          accounts: [maliciousUser],
        },
      } = await provider.snapshot(snapshot);

      const disallowed = registry.connect(provider.getSigner(maliciousUser));
      tx = disallowed.transferOwnership(maliciousUser);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('cannot be called when the owner is the MTC', async () => {
      const {
        system: { registry },
        config: {
          deployer,
          owners: { mtc },
        },
      } = await provider.snapshot(snapshot);

      tx = registry.transferOwnership(mtc);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.owner();
      await expect(tx).resolves.toBe(mtc);

      tx = registry.transferOwnership(deployer);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');

      const disallowed = registry.connect(provider.getSigner(mtc));
      tx = disallowed.transferOwnership(deployer);
      await expect(tx).rejects.toBeRevertedWith(
        'MTC cannot transfer ownership',
      );
    });
  });

  describe('deregisterPrimitive', () => {
    it('can only be called by owner', async () => {
      const {
        system: { registry },
        config: {
          accounts: [maliciousUser],
        },
      } = await provider.snapshot(snapshot);

      const disallowed = registry.connect(provider.getSigner(maliciousUser));
      const primitive = randomAddress();

      tx = disallowed.deregisterPrimitive(primitive);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow unregistered asset', async () => {
      const {
        system: { registry },
      } = await provider.snapshot(snapshot);
      const primitive = randomAddress();

      tx = registry.deregisterPrimitive(primitive);
      await expect(tx).rejects.toBeRevertedWith('_primitive is not registered');
    });

    it('primitive can be added', async () => {
      const {
        system: { registry },
      } = await provider.snapshot(snapshot);
      const primitive = randomAddress();

      tx = registry.registerPrimitive(primitive);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.primitiveIsRegistered(primitive);
      await expect(tx).resolves.toBeTruthy();
    });

    it('primitive can be removed', async () => {
      const {
        system: { registry },
      } = await provider.snapshot(snapshot);
      const primitive = randomAddress();

      tx = registry.registerPrimitive(primitive);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.primitiveIsRegistered(primitive);
      await expect(tx).resolves.toBeTruthy();

      tx = registry.deregisterPrimitive(primitive);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('PrimitiveRemoved');

      tx = registry.primitiveIsRegistered(primitive);
      await expect(tx).resolves.toBeFalsy();
    });
  });

  describe('registerPrimitive', () => {
    it('can only be called by owner', async () => {
      const {
        system: { registry },
        config: {
          accounts: [maliciousUser],
        },
      } = await provider.snapshot(snapshot);
      const primitive = randomAddress();
      const disallowed = registry.connect(provider.getSigner(maliciousUser));

      tx = disallowed.registerPrimitive(primitive);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow registered asset', async () => {
      const {
        system: { registry },
      } = await provider.snapshot(snapshot);
      const primitive = randomAddress();

      tx = registry.registerPrimitive(primitive);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerPrimitive(primitive);
      await expect(tx).rejects.toBeRevertedWith(
        '_primitive already registered',
      );
    });

    it('primitive can be added', async () => {
      const {
        system: { registry },
      } = await provider.snapshot(snapshot);
      const primitive = randomAddress();

      tx = registry.registerPrimitive(primitive);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('PrimitiveAdded');

      tx = registry.primitiveIsRegistered(primitive);
      await expect(tx).resolves.toBeTruthy();
    });
  });

  describe('registerDerivativePriceSource', () => {
    it('can only be called by owner', async () => {
      const {
        system: { registry },
        config: {
          accounts: [maliciousUser],
        },
      } = await provider.snapshot(snapshot);
      const disallowed = registry.connect(provider.getSigner(maliciousUser));
      const derivative = randomAddress();
      const source = randomAddress();

      tx = disallowed.registerDerivativePriceSource(derivative, source);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow registered asset', async () => {
      const {
        system: { registry },
      } = await provider.snapshot(snapshot);
      const derivative = randomAddress();
      const source = randomAddress();

      tx = registry.registerDerivativePriceSource(derivative, source);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerDerivativePriceSource(derivative, source);
      await expect(tx).rejects.toBeRevertedWith(
        'derivative already set to specified source',
      );
    });

    it('derivative is added', async () => {
      const {
        system: { registry },
      } = await provider.snapshot(snapshot);
      const derivative = randomAddress();
      const source = randomAddress();

      tx = registry.registerDerivativePriceSource(derivative, source);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.derivativeToPriceSource(derivative);
      await expect(tx).resolves.toBe(source);
    });

    it('derivative price source can be changed', async () => {
      const {
        system: { registry },
      } = await provider.snapshot(snapshot);
      const derivative = randomAddress();
      const source = randomAddress();
      const other = randomAddress();

      tx = registry.registerDerivativePriceSource(derivative, source);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('DerivativePriceSourceUpdated');

      tx = registry.derivativeToPriceSource(derivative);
      await expect(tx).resolves.toBe(source);

      tx = registry.registerDerivativePriceSource(derivative, other);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.derivativeToPriceSource(derivative);
      await expect(tx).resolves.toBe(other);
    });
  });

  describe('deregisterFee', () => {
    it('can only be called by owner', async () => {
      const {
        mockFee,
        system: { registry },
        config: {
          accounts: [maliciousUser],
        },
      } = await provider.snapshot(snapshot);
      const disallowed = registry.connect(provider.getSigner(maliciousUser));

      tx = disallowed.deregisterFee(mockFee);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow unregistered fee', async () => {
      const {
        mockFee,
        system: { registry },
      } = await provider.snapshot(snapshot);

      tx = registry.deregisterFee(mockFee);
      await expect(tx).rejects.toBeRevertedWith('_fee is not registered');
    });

    it('fee is removed', async () => {
      const {
        mockFee,
        system: { registry },
      } = await provider.snapshot(snapshot);

      tx = registry.registerFee(mockFee);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.feeIsRegistered(mockFee);
      await expect(tx).resolves.toBeTruthy();

      tx = registry.deregisterFee(mockFee);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('FeeRemoved');

      tx = registry.feeIsRegistered(mockFee);
      await expect(tx).resolves.toBeFalsy();
    });

    it.todo('feeIdentifierIsRegistered is set to false');
  });

  describe('registerFee', () => {
    it('can only be called by owner', async () => {
      const {
        mockFee,
        system: { registry },
        config: {
          accounts: [maliciousUser],
        },
      } = await provider.snapshot(snapshot);
      const disallowed = registry.connect(provider.getSigner(maliciousUser));

      tx = disallowed.registerFee(mockFee);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow registered asset', async () => {
      const {
        mockFee,
        system: { registry },
      } = await provider.snapshot(snapshot);
      const fee = randomAddress();

      tx = registry.registerFee(mockFee);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFee(mockFee);
      await expect(tx).rejects.toBeRevertedWith('_fee already registered');
    });

    it('fee is added', async () => {
      const {
        mockFee,
        system: { registry },
      } = await provider.snapshot(snapshot);

      tx = registry.registerFee(mockFee);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('FeeAdded');

      tx = registry.feeIsRegistered(mockFee);
      await expect(tx).resolves.toBeTruthy();
    });

    it.todo('does not allow empty Fee.FeeHook()');
    it.todo('does not allow empty Fee.identifier()');
    it.todo('does not allow fee with same Fee.identifier()');
  });

  describe('registerFund', () => {
    it('cannot be called by non-fund factory', async () => {
      const {
        system: { registry },
        config: {
          accounts: [maliciousUser],
        },
      } = await provider.snapshot(snapshot);
      const disallowed = registry.connect(provider.getSigner(maliciousUser));
      const fund = randomAddress();
      const manager = randomAddress();
      const name = utils.hashMessage('my fund');

      tx = disallowed.registerFund(fund, manager, name);
      await expect(tx).rejects.toBeRevertedWith(
        'Only fundFactory can call this function',
      );
    });

    it('does not allow registered fund', async () => {
      const {
        system: { registry },
        config: { deployer },
      } = await provider.snapshot(snapshot);
      await expect(registry.setFundFactory(deployer)).resolves.toBeReceipt();
      const fund = randomAddress();
      const manager = randomAddress();
      const name = utils.hashMessage('my fund');

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).rejects.toBeRevertedWith('Fund is already registered');
    });

    it('fund is added', async () => {
      const {
        system: { registry },
        config: { deployer },
      } = await provider.snapshot(snapshot);
      const fund = randomAddress();
      const manager = randomAddress();
      const name = utils.hashMessage('my fund');

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('FundAdded');

      tx = registry.fundIsRegistered(fund);
      await expect(tx).resolves.toBeTruthy();

      tx = registry.fundNameHashIsTaken(name);
      await expect(tx).resolves.toBeTruthy();

      tx = registry.managerToFunds(manager, 0);
      await expect(tx).resolves.toBe(fund);
    });

    it('does not allow duplicate fund registration', async () => {
      const {
        system: { registry },
        config: { deployer },
      } = await provider.snapshot(snapshot);
      const fund = randomAddress();
      const manager = randomAddress();
      const name = utils.hashMessage('my fund');

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).rejects.toBeRevertedWith('Fund is already registered');
    });

    it('does not allow fund with duplicate name', async () => {
      const {
        system: { registry },
        config: { deployer },
      } = await provider.snapshot(snapshot);
      const fund = randomAddress();
      const manager = randomAddress();
      const name = utils.hashMessage('my fund');

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).resolves.toBeReceipt();

      const other = randomAddress();
      tx = registry.registerFund(other, manager, name);
      await expect(tx).rejects.toBeRevertedWith('Fund name is already taken');
    });
  });
});
