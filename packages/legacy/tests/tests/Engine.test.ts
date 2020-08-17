import { BigNumberish, Signer, utils } from 'ethers';
import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { deployTestEnvironment } from '../deployment';
import * as contracts from '../contracts';
import {
  engineTakeOrderArgs,
  setupFundWithParams,
  takeOrderSignature,
} from '../utils';

function snapshot(provider: BuidlerProvider) {
  return deployTestEnvironment(provider);
}

async function warpEngine(provider: BuidlerProvider, engine: contracts.Engine) {
  const delay = await engine.thawingDelay();
  const warp = delay.add(1).toNumber();
  await provider.send('evm_increaseTime', [warp]);
  await provider.send('evm_mine', []);
}

async function seedEngine(
  deployer: Signer,
  registry: contracts.Registry,
  engine: contracts.Engine,
  amount: BigNumberish,
) {
  let tx;

  // Pretend to be the fund factory so we can call `payAmguInEther`.
  tx = registry.setFundFactory(deployer);
  await expect(tx).resolves.toBeReceipt();

  tx = engine.frozenEther();
  await expect(tx).resolves.toEqBigNumber(0);

  tx = engine.payAmguInEther.value(amount).send();
  await expect(tx).resolves.toBeReceipt();
  await expect(tx).resolves.toHaveEmitted('AmguPaid');

  tx = engine.frozenEther();
  await expect(tx).resolves.toEqBigNumber(amount);
}

async function thawEngine(engine: contracts.Engine, amount?: BigNumberish) {
  let tx;

  tx = engine.thaw();
  await expect(tx).resolves.toBeReceipt();
  await expect(tx).resolves.toHaveEmitted('Thaw');

  tx = engine.frozenEther();
  await expect(tx).resolves.toEqBigNumber(0);

  if (amount != null) {
    tx = engine.liquidEther();
    await expect(tx).resolves.toEqBigNumber(amount);
  }
}

let tx;

describe('Engine', () => {
  describe('constructor', () => {
    it('sets lastThaw to block.timestamp', async () => {
      const {
        system: { registry },
        config: {
          deployer,
          engine: { thawingDelay },
        },
      } = await provider.snapshot(snapshot);

      const engine = await contracts.Engine.deploy(
        deployer,
        thawingDelay,
        registry,
      );

      const block = await provider.getBlock('latest');
      tx = engine.lastThaw();
      await expect(tx).resolves.toEqBigNumber(block.timestamp);
    });

    it('sets registry', async () => {
      const {
        system: { engine, registry },
      } = await provider.snapshot(snapshot);

      tx = engine.registry();
      await expect(tx).resolves.toBe(registry.address);
    });

    it('sets thawingDelay', async () => {
      const {
        system: { engine },
        config: {
          engine: { thawingDelay },
        },
      } = await provider.snapshot(snapshot);

      tx = engine.thawingDelay();
      await expect(tx).resolves.toEqBigNumber(thawingDelay);
    });
  });

  describe('setRegistry', () => {
    it('can only be called by Registry.MTC', async () => {
      const {
        system: { engine },
        config: {
          accounts: [stranger],
        },
      } = await provider.snapshot(snapshot);
      const disallowed = engine.connect(provider.getSigner(stranger));
      const registry = randomAddress();

      tx = disallowed.setRegistry(registry);
      await expect(tx).rejects.toBeRevertedWith('Only MTC can call this');
    });

    it('sets registry', async () => {
      const {
        system: { engine },
      } = await provider.snapshot(snapshot);
      const registry = randomAddress();

      tx = engine.setRegistry(registry);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('RegistryChange');

      tx = engine.registry();
      await expect(tx).resolves.toBe(registry);
    });
  });

  describe('setAmguPrice', () => {
    it('can only be called by Registry.MGM', async () => {
      const {
        system: { engine },
      } = await provider.snapshot(snapshot);

      tx = engine.setAmguPrice(1);
      await expect(tx).rejects.toBeRevertedWith('Only MGM can call this');
    });

    it('sets amguPrice', async () => {
      const {
        system: { engine },
        config: {
          owners: { mgm },
        },
      } = await provider.snapshot(snapshot);
      const connected = engine.connect(provider.getSigner(mgm));

      tx = connected.setAmguPrice(1);
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted('SetAmguPrice');

      tx = engine.amguPrice();
      await expect(tx).resolves.toEqBigNumber(1);
    });
  });

  describe('premiumPercent', () => {
    it('returns 0 if liquidEther is under 1 ether', async () => {
      const {
        system: { registry, engine },
        config: { deployer },
      } = await provider.snapshot(snapshot);

      const amount = utils.parseEther('0.99');
      await seedEngine(deployer, registry, engine, amount);
      await warpEngine(provider, engine);
      await thawEngine(engine, amount);

      tx = engine.premiumPercent();
      await expect(tx).resolves.toEqBigNumber(0);

      tx = engine.enginePrice();
      await expect(tx).resolves.toEqBigNumber(utils.parseEther('1'));
    });

    it('returns 5 if liquidEther is 1 ether', async () => {
      const {
        system: { registry, engine },
        config: { deployer },
      } = await provider.snapshot(snapshot);

      const amount = utils.parseEther('1');
      await seedEngine(deployer, registry, engine, amount);
      await warpEngine(provider, engine);
      await thawEngine(engine, amount);

      tx = engine.premiumPercent();
      await expect(tx).resolves.toEqBigNumber(5);

      tx = engine.enginePrice();
      await expect(tx).resolves.toEqBigNumber(utils.parseEther('1.05'));
    });

    it('returns 10 if liquidEther is 5 ether', async () => {
      const {
        system: { registry, engine },
        config: { deployer },
      } = await provider.snapshot(snapshot);

      const amount = utils.parseEther('5');
      await seedEngine(deployer, registry, engine, amount);
      await warpEngine(provider, engine);
      await thawEngine(engine, amount);

      tx = engine.premiumPercent();
      await expect(tx).resolves.toEqBigNumber(10);

      tx = engine.enginePrice();
      await expect(tx).resolves.toEqBigNumber(utils.parseEther('1.10'));
    });

    it('returns 15 if liquidEther is 10 ether', async () => {
      const {
        system: { registry, engine },
        config: { deployer },
      } = await provider.snapshot(snapshot);

      const amount = utils.parseEther('10');
      await seedEngine(deployer, registry, engine, amount);
      await warpEngine(provider, engine);
      await thawEngine(engine, amount);

      tx = engine.premiumPercent();
      await expect(tx).resolves.toEqBigNumber(15);

      tx = engine.enginePrice();
      await expect(tx).resolves.toEqBigNumber(utils.parseEther('1.15'));
    });
  });

  describe('payAmguInEther', () => {
    it('adds sent ETH to frozenEther', async () => {
      const {
        system: { registry, engine },
        config: { deployer },
      } = await provider.snapshot(snapshot);

      const amount = utils.parseEther('1337');
      await seedEngine(deployer, registry, engine, amount);

      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(amount);
    });
  });

  describe('thaw', () => {
    it('cannot be called when thawingDelay has not elapsed since lastThaw', async () => {
      const {
        system: { registry, engine },
        config: { deployer },
      } = await provider.snapshot(snapshot);

      const amount = utils.parseEther('1337');
      await seedEngine(deployer, registry, engine, amount);
      tx = engine.thaw();
      await expect(tx).rejects.toBeRevertedWith('Thawing delay has not passed');
    });

    it('cannot be called when frozenEther is 0', async () => {
      const {
        system: { engine },
      } = await provider.snapshot(snapshot);

      await warpEngine(provider, engine);
      tx = engine.thaw();
      await expect(tx).rejects.toBeRevertedWith('No frozen ether to thaw');
    });

    it('frozenEther is added to liquidEther and reset to 0', async () => {
      const {
        system: { registry, engine },
        config: { deployer },
      } = await provider.snapshot(snapshot);

      const amount = utils.parseEther('0.01');
      await seedEngine(deployer, registry, engine, amount);
      await warpEngine(provider, engine);

      const preLiquidEther = await engine.liquidEther();
      await thawEngine(engine, amount);
      const postLiquidEther = await engine.liquidEther();

      expect(postLiquidEther.sub(preLiquidEther)).toEqBigNumber(amount);

      tx = engine.frozenEther();
      await expect(tx).resolves.toEqBigNumber(0);
    });
  });

  describe('sellAndBurnMln', () => {
    it('reverts if mlnAmount value is greater than available liquidEther', async () => {
      const {
        system: {
          registry,
          engine,
          engineAdapter,
          sharesRequestor,
          valueInterpreter,
          fundFactory,
        },
        config: {
          deployer,
          weth,
          tokens: { mln },
        },
      } = await provider.snapshot(snapshot);

      const amount = utils.parseEther('1');
      await seedEngine(deployer, registry, engine, amount);
      await warpEngine(provider, engine);
      await thawEngine(engine, amount);

      const liquidEther = await engine.liquidEther();
      const mlnValue = await valueInterpreter.calcCanonicalAssetValue
        .args(mln, liquidEther, weth)
        .call();

      // Create a fund denominated in mln with a small initial investment for
      // burning mln on the engine.
      const fund = await setupFundWithParams({
        denominationAsset: mln,
        factory: fundFactory,
        adapters: [engineAdapter],
        investment: {
          sharesRequestor,
          investmentAmount: utils.parseEther('10'),
        },
      });

      const mlnAmount = mlnValue.value_.add(1);
      const encodedArgs = await engineTakeOrderArgs(1, mlnAmount);
      tx = fund.vault.callOnIntegration(
        engineAdapter,
        takeOrderSignature,
        encodedArgs,
      );

      await expect(tx).rejects.toBeRevertedWith(
        'Not enough liquid ether to send',
      );
    });

    it('burns mlnAmount', async () => {
      const {
        system: {
          registry,
          engine,
          engineAdapter,
          sharesRequestor,
          fundFactory,
        },
        config: {
          deployer,
          weth,
          tokens: { mln },
        },
      } = await provider.snapshot(snapshot);

      const amount = utils.parseEther('100');
      await seedEngine(deployer, registry, engine, amount);
      await warpEngine(provider, engine);
      await thawEngine(engine, amount);

      const mlnAmount = utils.parseEther('1');
      const ethToSend = await engine.ethPayoutForMlnAmount(mlnAmount);
      const preLiquidEther = await engine.liquidEther();

      // Create a fund denominated in mln with a small initial investment for
      // burning mln on the engine.
      const fund = await setupFundWithParams({
        denominationAsset: mln,
        factory: fundFactory,
        adapters: [engineAdapter],
        investment: {
          sharesRequestor,
          investmentAmount: utils.parseEther('10'),
        },
      });

      const preFundWeth = await weth.balanceOf(fund.vault);

      const encodedArgs = await engineTakeOrderArgs(1, mlnAmount);
      tx = fund.vault.callOnIntegration(
        engineAdapter,
        takeOrderSignature,
        encodedArgs,
      );

      const event = contracts.Engine.abi.getEvent('Burn');
      await expect(tx).resolves.toBeReceipt();
      await expect(tx).resolves.toHaveEmitted(event);

      const postLiquidEther = await engine.liquidEther();
      expect(preLiquidEther.sub(ethToSend)).toEqBigNumber(postLiquidEther);

      const postFundWeth = await weth.balanceOf(fund.vault);
      expect(postFundWeth.sub(preFundWeth)).toEqBigNumber(ethToSend);
    });
  });
});
