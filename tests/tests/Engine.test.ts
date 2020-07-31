import { utils } from 'ethers';
import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { Registry } from '../contracts/codegen/Registry';
import { Engine } from '../contracts/codegen/Engine';
import { ERC20WithFields } from '../contracts/codegen/ERC20WithFields';
import { IPriceSource } from '../contracts/codegen/IPriceSource';

async function deploy(provider: BuidlerProvider) {
  const signer = provider.getSigner(0);
  const mtc = await provider.getSigner(1).getAddress();
  const mgm = await provider.getSigner(2).getAddress();
  const stranger = await provider.getSigner(5).getAddress();
  const melonEngineDelay = 2592000;
  const mlnToken = randomAddress();
  const nativeAsset = randomAddress();

  const deployer = await signer.getAddress();

  const registry = await Registry.deploy(signer, mtc, mgm);
  const mockPriceSource = await IPriceSource.mock(signer);
  await registry.setPriceSource(mockPriceSource);
  await registry.setMlnToken(mlnToken);
  await registry.setNativeAsset(nativeAsset);
  await mockPriceSource.getCanonicalRate
    .given(mlnToken, nativeAsset)
    .returns(utils.parseEther('1'), true, 0);

  const engine = await Engine.deploy(
    signer,
    melonEngineDelay,
    registry.address,
  );
  const lastThaw = (await provider.getBlock('latest')).timestamp;

  return {
    stranger,
    deployer,
    registry,
    engine,
    mtc,
    mgm,
    melonEngineDelay,
    lastThaw,
  };
}

async function deployMock(provider: BuidlerProvider) {
  const signer = provider.getSigner(0);
  const mtc = await provider.getSigner(1).getAddress();
  const mgm = await provider.getSigner(2).getAddress();
  const stranger = await provider.getSigner(5).getAddress();
  const melonEngineDelay = 2592000;

  const deployer = await signer.getAddress();

  const mockRegistry = await Registry.mock(signer);
  const mockMln = await ERC20WithFields.mock(signer);

  const engine = await Engine.deploy(signer, melonEngineDelay, mockRegistry);
  const lastThaw = (await provider.getBlock('latest')).timestamp;

  await mockRegistry.integrationAdapterIsRegistered
    .given(deployer)
    .returns(true);
  await mockRegistry.mlnToken.returns(mockMln);
  await mockRegistry.fundFactory.returns(deployer);
  await mockMln.transferFrom
    .given(deployer, engine, utils.parseEther('1'))
    .returns(true);

  return {
    stranger,
    deployer,
    mockRegistry,
    engine,
    mtc,
    mgm,
    melonEngineDelay,
    lastThaw,
  };
}

let call, tx;

describe('Engine', () => {
  describe('constructor', () => {
    it('sets lastThaw to block.timestamp', async () => {
      const { engine, lastThaw } = await provider.snapshot(deploy);

      call = engine.lastThaw();
      await expect(call).resolves.toEqBigNumber(lastThaw);
    });

    it('sets registry', async () => {
      const { registry, engine } = await provider.snapshot(deploy);

      call = engine.registry();
      await expect(call).resolves.toBe(registry.address);
    });

    it('sets thawingDelay', async () => {
      const { engine, melonEngineDelay } = await provider.snapshot(deploy);

      call = engine.thawingDelay();
      await expect(call).resolves.toEqBigNumber(melonEngineDelay);
    });
  });

  describe('setRegistry', () => {
    it('can only be called by Registry.MTC', async () => {
      const { engine, stranger } = await provider.snapshot(deploy);
      const disallowed = engine.connect(provider.getSigner(stranger));
      const registry = randomAddress();

      tx = disallowed.setRegistry(registry);
      await expect(tx).rejects.toBeRevertedWith('Only MTC can call this');
    });

    it('sets registry', async () => {
      const { engine } = await provider.snapshot(deploy);
      const registry = randomAddress();

      tx = engine.setRegistry(registry);
      await expect(tx).resolves.toBeReceipt();

      call = engine.registry();
      await expect(call).resolves.toBe(registry);
    });

    it.todo('emits RegistryChange(registry)');
  });

  describe('setAmguPrice', () => {
    it('can only be called by Registry.MGM', async () => {
      const { engine } = await provider.snapshot(deploy);

      tx = engine.setAmguPrice(1);
      await expect(tx).rejects.toBeRevertedWith('Only MGM can call this');
    });

    it('sets amguPrice', async () => {
      const { engine, mgm } = await provider.snapshot(deploy);
      const connected = engine.connect(provider.getSigner(mgm));

      tx = connected.setAmguPrice(1);
      await expect(tx).resolves.toBeReceipt();

      call = engine.amguPrice();
      await expect(call).resolves.toEqBigNumber(1);
    });

    it.todo('emits SetAmguPrice(price)');
  });

  describe('premiumPercent', () => {
    it('returns 0 if liquidEther is under 1 ether', async () => {
      const { registry, engine, deployer, lastThaw } = await provider.snapshot(
        deploy,
      );

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('0.99');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      call = engine.liquidEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);

      call = engine.premiumPercent();
      await expect(call).resolves.toEqBigNumber(0);
    });

    it('returns 5 if liquidEther is 1 ether', async () => {
      const { registry, engine, deployer, lastThaw } = await provider.snapshot(
        deploy,
      );

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('1');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      call = engine.liquidEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);

      call = engine.premiumPercent();
      await expect(call).resolves.toEqBigNumber(5);
    });

    it('returns 10 if liquidEther is 5 ether', async () => {
      const { registry, engine, deployer, lastThaw } = await provider.snapshot(
        deploy,
      );

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('5');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      call = engine.liquidEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);

      call = engine.premiumPercent();
      await expect(call).resolves.toEqBigNumber(10);
    });

    it('returns 15 if liquidEther is 10 ether', async () => {
      const { registry, engine, deployer, lastThaw } = await provider.snapshot(
        deploy,
      );

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('10');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      call = engine.liquidEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);

      call = engine.premiumPercent();
      await expect(call).resolves.toEqBigNumber(15);
    });
  });

  describe('payAmguInEther', () => {
    it('adds sent ETH to frozenEther', async () => {
      const { registry, engine, deployer } = await provider.snapshot(deploy);

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('0.01');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
    });

    it.todo(
      'emits AmguPaid(amguConsumed) [can ignore for now, need to change]',
    );
  });

  describe('thaw', () => {
    it('cannot be called when thawingDelay has not elapsed since lastThaw', async () => {
      const { engine, lastThaw } = await provider.snapshot(deploy);
      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp - 60,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).rejects.toBeRevertedWith('Thawing delay has not passed');
    });

    it('cannot be called when frozenEther is 0', async () => {
      const { engine, lastThaw } = await provider.snapshot(deploy);
      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).rejects.toBeRevertedWith('No frozen ether to thaw');
    });

    it('frozenEther is added to liquidEther and reset to 0', async () => {
      const { registry, engine, lastThaw, deployer } = await provider.snapshot(
        deploy,
      );
      const ethAmount = utils.parseEther('0.01');

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();
      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      const preLiquidEther = await engine.liquidEther();
      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      const postLiquidEther = await engine.liquidEther();

      expect(postLiquidEther.sub(preLiquidEther)).toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);
    });

    it.todo('emits Thaw(frozenEther)');
  });

  describe('enginePrice', () => {
    it('returns 100% of ethPerMln rate when liquidEther is under 1 ether', async () => {
      const { registry, engine, deployer, lastThaw } = await provider.snapshot(
        deploy,
      );

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('0.99');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      call = engine.liquidEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);

      call = engine.premiumPercent();
      await expect(call).resolves.toEqBigNumber(0);

      tx = engine.enginePrice();
      await expect(tx).resolves.toEqBigNumber(utils.parseEther('1'));
    });

    it('returns 105% of ethPerMln rate when liquidEther is 1 ether', async () => {
      const { registry, engine, deployer, lastThaw } = await provider.snapshot(
        deploy,
      );

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('1');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      call = engine.liquidEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);

      call = engine.premiumPercent();
      await expect(call).resolves.toEqBigNumber(5);

      tx = engine.enginePrice();
      await expect(tx).resolves.toEqBigNumber(utils.parseEther('1.05'));
    });

    it('returns 110% of ethPerMln rate when liquidEther is 5 ether', async () => {
      const { registry, engine, deployer, lastThaw } = await provider.snapshot(
        deploy,
      );

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('5');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      call = engine.liquidEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);

      call = engine.premiumPercent();
      await expect(call).resolves.toEqBigNumber(10);

      tx = engine.enginePrice();
      await expect(tx).resolves.toEqBigNumber(utils.parseEther('1.10'));
    });

    it('returns 115% of ethPerMln rate when liquidEther is 10 ether', async () => {
      const { registry, engine, deployer, lastThaw } = await provider.snapshot(
        deploy,
      );

      tx = registry.setFundFactory(deployer);
      await expect(tx).resolves.toBeReceipt();

      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('10');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      call = engine.liquidEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);

      call = engine.premiumPercent();
      await expect(call).resolves.toEqBigNumber(15);

      tx = engine.enginePrice();
      await expect(tx).resolves.toEqBigNumber(utils.parseEther('1.15'));
    });
  });

  describe('sellAndBurnMln', () => {
    // TODO: Re-enable this.
    it.skip('reverts if mlnAmount value is greater than available liquidEther', async () => {
      const { engine, lastThaw } = await provider.snapshot(deployMock);
      await expect(engine.frozenEther()).resolves.toEqBigNumber(0);
      const ethAmount = utils.parseEther('1');

      tx = engine.payAmguInEther.value(ethAmount).send();
      await expect(tx).resolves.toBeReceipt();

      call = engine.frozenEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);

      const thawingDelay = (await engine.thawingDelay()).toNumber();
      const currentTimestamp = (await provider.getBlock('latest')).timestamp;

      await provider.send('evm_increaseTime', [
        lastThaw + thawingDelay - currentTimestamp + 1,
      ]);
      await provider.send('evm_mine', []);

      tx = engine.thaw();
      await expect(tx).resolves.toBeReceipt();
      call = engine.liquidEther();
      await expect(call).resolves.toEqBigNumber(ethAmount);
      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);

      call = engine.premiumPercent();
      await expect(call).resolves.toEqBigNumber(5);

      tx = engine.enginePrice();
      await expect(tx).resolves.toEqBigNumber(utils.parseEther('1.05'));

      // TODO
    });

    it('burns mlnAmount', async () => {});

    it('transfers expected ether amount to sender', async () => {});

    it('subtracts sent ETH from frozenEther', async () => {});

    it.todo('emits Burn(mlnAmount)');
  });
});
