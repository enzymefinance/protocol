import { BuidlerProvider } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { randomAddress } from '../utils';
import { commonConfigSnapshot } from '../utils/snapshots/commonConfig';
import { registrySnapshot } from '../utils/snapshots/infrastructure';

async function deploy(provider: BuidlerProvider) {
  const { accounts } = await commonConfigSnapshot(provider);

  const mlnAddress = randomAddress();
  const nativeAssetAddress = randomAddress();
  const { registry } = await registrySnapshot(
    provider,
    mlnAddress,
    nativeAssetAddress,
  );

  return {
    accounts,
    registry,
  };
}

let tx;

describe('Registry', () => {
  describe('constructor', () => {
    it('MTC is set', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);

      tx = registry.MTC();
      await expect(tx).resolves.toBe(accounts.mtc);
    });

    it('MGM is set', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);

      tx = registry.MGM();
      await expect(tx).resolves.toBe(accounts.mgm);
    });

    it.todo('check mln and nativeAsset (once added to constructor');
  });

  describe('transferOwnership', () => {
    it('can only be called by owner', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);
      const disallowed = registry.connect(
        provider.getSigner(accounts.maliciousUser),
      );

      tx = disallowed.transferOwnership(accounts.maliciousUser);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('cannot be called when the owner is the MTC', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);

      tx = registry.transferOwnership(accounts.mtc);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.owner();
      await expect(tx).resolves.toBe(accounts.mtc);

      tx = registry.transferOwnership(accounts.deployer);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');

      const disallowed = registry.connect(provider.getSigner(accounts.mtc));
      tx = disallowed.transferOwnership(accounts.deployer);
      await expect(tx).rejects.toBeRevertedWith(
        'MTC cannot transfer ownership',
      );
    });
  });

  describe('deregisterPrimitive', () => {
    it('can only be called by owner', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);
      const disallowed = registry.connect(
        provider.getSigner(accounts.maliciousUser),
      );
      const primitive = randomAddress();

      tx = disallowed.deregisterPrimitive(primitive);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow unregistered asset', async () => {
      const { registry } = await provider.snapshot(deploy);
      const primitive = randomAddress();

      tx = registry.deregisterPrimitive(primitive);
      await expect(tx).rejects.toBeRevertedWith('_primitive is not registered');
    });

    it('primitive can be added', async () => {
      const { registry } = await provider.snapshot(deploy);
      const primitive = randomAddress();

      tx = registry.registerPrimitive(primitive);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.primitiveIsRegistered(primitive);
      await expect(tx).resolves.toBeTruthy();
    });

    it('primitive can be removed', async () => {
      const { registry } = await provider.snapshot(deploy);
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
      const { accounts, registry } = await provider.snapshot(deploy);
      const disallowed = registry.connect(
        provider.getSigner(accounts.maliciousUser),
      );
      const primitive = randomAddress();

      tx = disallowed.registerPrimitive(primitive);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow registered asset', async () => {
      const { registry } = await provider.snapshot(deploy);
      const primitive = randomAddress();

      tx = registry.registerPrimitive(primitive);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerPrimitive(primitive);
      await expect(tx).rejects.toBeRevertedWith(
        '_primitive already registered',
      );
    });

    it('primitive can be added', async () => {
      const { registry } = await provider.snapshot(deploy);
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
      const { accounts, registry } = await provider.snapshot(deploy);
      const disallowed = registry.connect(
        provider.getSigner(accounts.maliciousUser),
      );
      const derivative = randomAddress();
      const source = randomAddress();

      tx = disallowed.registerDerivativePriceSource(derivative, source);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow registered asset', async () => {
      const { registry } = await provider.snapshot(deploy);
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
      const { registry } = await provider.snapshot(deploy);
      const derivative = randomAddress();
      const source = randomAddress();

      tx = registry.registerDerivativePriceSource(derivative, source);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.derivativeToPriceSource(derivative);
      await expect(tx).resolves.toBe(source);
    });

    it('derivative price source can be changed', async () => {
      const { registry } = await provider.snapshot(deploy);
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
      const { accounts, registry } = await provider.snapshot(deploy);
      const disallowed = registry.connect(
        provider.getSigner(accounts.maliciousUser),
      );
      const fee = randomAddress();

      tx = disallowed.deregisterFee(fee);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow unregistered fee', async () => {
      const { registry } = await provider.snapshot(deploy);
      const fee = randomAddress();

      tx = registry.deregisterFee(fee);
      await expect(tx).rejects.toBeRevertedWith('_fee is not registered');
    });

    it('fee is removed', async () => {
      const { registry } = await provider.snapshot(deploy);
      const fee = randomAddress();

      tx = registry.registerFee(fee);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.feeIsRegistered(fee);
      await expect(tx).resolves.toBeTruthy();

      tx = registry.deregisterFee(fee);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('FeeRemoved');

      tx = registry.feeIsRegistered(fee);
      await expect(tx).resolves.toBeFalsy();
    });

    it.todo('feeIdentifierIsRegistered is set to false');
  });

  describe('registerFee', () => {
    it('can only be called by owner', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);
      const disallowed = registry.connect(
        provider.getSigner(accounts.maliciousUser),
      );
      const fee = randomAddress();

      tx = disallowed.registerFee(fee);
      await expect(tx).rejects.toBeRevertedWith('caller is not the owner');
    });

    it('does not allow registered asset', async () => {
      const { registry } = await provider.snapshot(deploy);
      const fee = randomAddress();

      tx = registry.registerFee(fee);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFee(fee);
      await expect(tx).rejects.toBeRevertedWith('_fee already registered');
    });

    it('fee is added', async () => {
      const { registry } = await provider.snapshot(deploy);
      const fee = randomAddress();

      tx = registry.registerFee(fee);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('FeeAdded');

      tx = registry.feeIsRegistered(fee);
      await expect(tx).resolves.toBeTruthy();
    });

    it.todo('does not allow empty Fee.FeeHook()');
    it.todo('does not allow empty Fee.identifier()');
    it.todo('does not allow fee with same Fee.identifier()');
  });

  describe('registerFund', () => {
    it('cannot be called by non-fund factory', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);
      const disallowed = registry.connect(
        provider.getSigner(accounts.maliciousUser),
      );
      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      tx = disallowed.registerFund(fund, manager, name);
      await expect(tx).rejects.toBeRevertedWith(
        'Only fundFactory can call this function',
      );
    });

    it('does not allow registered fund', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);
      await expect(
        registry.setFundFactory(accounts.deployer),
      ).resolves.toBeReceipt();

      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).rejects.toBeRevertedWith('Fund is already registered');
    });

    it('fund is added', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);
      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      tx = registry.setFundFactory(accounts.deployer);
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
      const { accounts, registry } = await provider.snapshot(deploy);
      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      tx = registry.setFundFactory(accounts.deployer);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).rejects.toBeRevertedWith('Fund is already registered');
    });

    it('does not allow fund with duplicate name', async () => {
      const { accounts, registry } = await provider.snapshot(deploy);
      const fund = randomAddress();
      const manager = randomAddress();
      const name = ethers.utils.hashMessage('my fund');

      tx = registry.setFundFactory(accounts.deployer);
      await expect(tx).resolves.toBeReceipt();

      tx = registry.registerFund(fund, manager, name);
      await expect(tx).resolves.toBeReceipt();

      const other = randomAddress();
      tx = registry.registerFund(other, manager, name);
      await expect(tx).rejects.toBeRevertedWith('Fund name is already taken');
    });
  });
});
