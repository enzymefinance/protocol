import { BuidlerProvider } from 'crestproject';
import { ethers } from 'ethers';
import { Registry } from '../contracts/Registry';
import { randomAddress } from '../utils';

async function deploy(provider: BuidlerProvider) {
  const signer = provider.getSigner(0);
  const mtc = await provider.getSigner(1).getAddress();
  const mgm = await provider.getSigner(2).getAddress();
  const stranger = await provider.getSigner(5).getAddress();

  const deployer = await signer.getAddress();
  const registry = await Registry.deploy(signer, mtc, mgm);

  return {
    stranger,
    deployer,
    registry,
    mtc,
    mgm,
  };
}

describe('Registry', () => {
  describe('constructor', () => {
    it('MTC is set', async () => {
      const { registry, mtc } = await provider.snapshot(deploy);
      await expect(registry.MTC()).resolves.toBe(mtc);
    });

    it('MGM is set', async () => {
      const { registry, mgm } = await provider.snapshot(deploy);
      await expect(registry.MGM()).resolves.toBe(mgm);
    });
  });

  describe('transferOwnership', () => {
    it('can only be called by owner', async () => {
      const fixtures = await provider.snapshot(deploy);
      const registry = fixtures.registry.connect(
        provider.getSigner(fixtures.stranger),
      );

      await expect(
        registry.transferOwnership(fixtures.stranger),
      ).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('cannot be called when the owner is the MTC', async () => {
      const { registry, mtc, deployer } = await provider.snapshot(deploy);

      await expect(registry.transferOwnership(mtc)).resolves.toBeReceipt();
      await expect(registry.owner()).resolves.toBe(mtc);
      await expect(
        registry.transferOwnership(deployer),
      ).rejects.toBeRevertedWith('caller is not the owner');

      const connected = registry.connect(provider.getSigner(mtc));
      await expect(
        connected.transferOwnership(deployer),
      ).rejects.toBeRevertedWith('MTC cannot transfer ownership');
    });
  });

  describe('deregisterPrimitive', () => {
    it('can only be called by owner', async () => {
      const { registry, stranger } = await provider.snapshot(deploy);
      const disallowed = registry.connect(provider.getSigner(stranger));
      const primitive = randomAddress();

      await expect(
        disallowed.deregisterPrimitive(primitive),
      ).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow unregistered asset', async () => {
      const { registry } = await provider.snapshot(deploy);
      const primitive = randomAddress();

      await expect(
        registry.deregisterPrimitive(primitive),
      ).rejects.toBeRevertedWith('_primitive is not registered');
    });

    it('primitive is removed', async () => {
      const { registry } = await provider.snapshot(deploy);
      const primitive = randomAddress();

      await expect(
        registry.registerPrimitive(primitive),
      ).resolves.toBeReceipt();

      await expect(
        registry.primitiveIsRegistered(primitive),
      ).resolves.toBeTruthy();

      await expect(
        registry.deregisterPrimitive(primitive),
      ).resolves.toBeReceipt();

      await expect(
        registry.primitiveIsRegistered(primitive),
      ).resolves.toBeFalsy();
    });

    it.todo('emits PrimitiveRemoved');
  });

  describe('registerPrimitive', () => {
    it('can only be called by owner', async () => {
      const { registry, stranger } = await provider.snapshot(deploy);
      const disallowed = registry.connect(provider.getSigner(stranger));
      const primitive = randomAddress();

      await expect(
        disallowed.registerPrimitive(primitive),
      ).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow registered asset', async () => {
      const { registry } = await provider.snapshot(deploy);
      const primitive = randomAddress();

      await expect(
        registry.registerPrimitive(primitive),
      ).resolves.toBeReceipt();

      await expect(
        registry.registerPrimitive(primitive),
      ).rejects.toBeRevertedWith('_primitive already registered');
    });

    it('primitive is added', async () => {
      const { registry } = await provider.snapshot(deploy);
      const primitive = randomAddress();

      await expect(
        registry.registerPrimitive(primitive),
      ).resolves.toBeReceipt();

      await expect(
        registry.primitiveIsRegistered(primitive),
      ).resolves.toBeTruthy();
    });

    it.todo('emits PrimitiveAdded');
  });

  describe('registerDerivativePriceSource', () => {
    it('can only be called by owner', async () => {
      const { registry, stranger } = await provider.snapshot(deploy);
      const disallowed = registry.connect(provider.getSigner(stranger));
      const derivative = randomAddress();
      const source = randomAddress();

      await expect(
        disallowed.registerDerivativePriceSource(derivative, source),
      ).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow registered asset', async () => {
      const { registry } = await provider.snapshot(deploy);
      const derivative = randomAddress();
      const source = randomAddress();

      await expect(
        registry.registerDerivativePriceSource(derivative, source),
      ).resolves.toBeReceipt();

      await expect(
        registry.registerDerivativePriceSource(derivative, source),
      ).rejects.toBeRevertedWith('derivative already set to specified source');
    });

    it('derivative is added', async () => {
      const { registry } = await provider.snapshot(deploy);
      const derivative = randomAddress();
      const source = randomAddress();

      await expect(
        registry.registerDerivativePriceSource(derivative, source),
      ).resolves.toBeReceipt();

      await expect(registry.derivativeToPriceSource(derivative)).resolves.toBe(
        source,
      );
    });

    it('derivative price source can be changed', async () => {
      const { registry } = await provider.snapshot(deploy);
      const derivative = randomAddress();
      const source = randomAddress();
      const other = randomAddress();

      await expect(
        registry.registerDerivativePriceSource(derivative, source),
      ).resolves.toBeReceipt();

      await expect(registry.derivativeToPriceSource(derivative)).resolves.toBe(
        source,
      );

      await expect(
        registry.registerDerivativePriceSource(derivative, other),
      ).resolves.toBeReceipt();

      await expect(registry.derivativeToPriceSource(derivative)).resolves.toBe(
        other,
      );
    });

    it.todo('emits DerivativePriceSourceUpdated');
  });

  describe('deregisterFee', () => {
    it('can only be called by owner', async () => {
      const { registry, stranger } = await provider.snapshot(deploy);
      const disallowed = registry.connect(provider.getSigner(stranger));
      const fee = randomAddress();

      await expect(disallowed.deregisterFee(fee)).rejects.toBeRevertedWith(
        'caller is not the owner',
      );
    });

    it('does not allow unregistered fee', async () => {
      const { registry } = await provider.snapshot(deploy);
      const fee = randomAddress();

      await expect(registry.deregisterFee(fee)).rejects.toBeRevertedWith(
        '_fee is not registered',
      );
    });

    it('fee is removed', async () => {
      const { registry } = await provider.snapshot(deploy);
      const fee = randomAddress();

      await expect(registry.registerFee(fee)).resolves.toBeReceipt();
      await expect(registry.feeIsRegistered(fee)).resolves.toBeTruthy();
      await expect(registry.deregisterFee(fee)).resolves.toBeReceipt();
      await expect(registry.feeIsRegistered(fee)).resolves.toBeFalsy();
    });

    it.todo('feeIdentifierIsRegistered is set to false');
    it.todo('emits FeeRemoved(fee, identifier)');
  });

  describe('registerFee', () => {
    it('can only be called by owner', async () => {
      const { registry, stranger } = await provider.snapshot(deploy);
      const disallowed = registry.connect(provider.getSigner(stranger));
      const fee = randomAddress();

      await expect(disallowed.registerFee(fee)).rejects.toBeRevertedWith(
        'caller is not the owner',
      );
    });

    it('does not allow registered asset', async () => {
      const { registry } = await provider.snapshot(deploy);
      const fee = randomAddress();

      await expect(registry.registerFee(fee)).resolves.toBeReceipt();

      await expect(registry.registerFee(fee)).rejects.toBeRevertedWith(
        '_fee already registered',
      );
    });

    it('fee is added', async () => {
      const { registry } = await provider.snapshot(deploy);
      const fee = randomAddress();

      await expect(registry.registerFee(fee)).resolves.toBeReceipt();

      await expect(registry.feeIsRegistered(fee)).resolves.toBeTruthy();
    });

    it.todo('emits FeeAdded(fee, identifier)');
    it.todo('does not allow empty Fee.FeeHook()');
    it.todo('does not allow empty Fee.identifier()');
    it.todo('does not allow fee with same Fee.identifier()');
  });

  describe('registerFund', () => {
    it('cannot be called by non-fund factory', async () => {
      const { registry, stranger } = await provider.snapshot(deploy);
      const disallowed = registry.connect(provider.getSigner(stranger));
      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      await expect(
        disallowed.registerFund(fund, manager, name),
      ).rejects.toBeRevertedWith('Only fundFactory can call this function');
    });

    it('does not allow registered fund', async () => {
      const { deployer, registry } = await provider.snapshot(deploy);
      await expect(registry.setFundFactory(deployer)).resolves.toBeReceipt();

      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      await expect(
        registry.registerFund(fund, manager, name),
      ).resolves.toBeReceipt();

      await expect(
        registry.registerFund(fund, manager, name),
      ).rejects.toBeRevertedWith('Fund is already registered');
    });

    it('fund is added', async () => {
      const { deployer, registry } = await provider.snapshot(deploy);
      await expect(registry.setFundFactory(deployer)).resolves.toBeReceipt();

      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      await expect(
        registry.registerFund(fund, manager, name),
      ).resolves.toBeReceipt();

      await expect(registry.fundIsRegistered(fund)).resolves.toBeTruthy();
      await expect(registry.fundNameHashIsTaken(name)).resolves.toBeTruthy();
      await expect(registry.managerToFunds(manager, 0)).resolves.toBe(fund);
    });

    it('does not allow duplicate fund registration', async () => {
      const { deployer, registry } = await provider.snapshot(deploy);
      await expect(registry.setFundFactory(deployer)).resolves.toBeReceipt();

      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      await expect(
        registry.registerFund(fund, manager, name),
      ).resolves.toBeReceipt();

      await expect(
        registry.registerFund(fund, manager, name),
      ).rejects.toBeRevertedWith('Fund is already registered');
    });

    it('does not allow fund with duplicate name', async () => {
      const { deployer, registry } = await provider.snapshot(deploy);
      await expect(registry.setFundFactory(deployer)).resolves.toBeReceipt();

      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      await expect(
        registry.registerFund(fund, manager, name),
      ).resolves.toBeReceipt();

      const other = randomAddress();
      await expect(
        registry.registerFund(other, manager, name),
      ).rejects.toBeRevertedWith('Fund name is already taken');
    });

    it.todo('emits FundAdded(manager, hub, hashName)');
  });
});
