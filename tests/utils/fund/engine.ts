import { BigNumberish, Signer } from 'ethers';
import { BuidlerProvider } from '@crestproject/crestproject';
import * as contracts from '../../contracts';

export async function warpEngine(
  provider: BuidlerProvider,
  engine: contracts.Engine,
) {
  const delay = await engine.thawingDelay();
  const warp = delay.add(1).toNumber();
  await provider.send('evm_increaseTime', [warp]);
  await provider.send('evm_mine', []);
}

export async function seedEngine(
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

export async function thawEngine(
  engine: contracts.Engine,
  amount?: BigNumberish,
) {
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
