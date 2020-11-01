import { BigNumber } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { Engine } from '@melonproject/protocol';

export async function seedAndThawEngine(
  provider: EthereumTestnetProvider,
  engine: Engine,
  amount: BigNumber,
) {
  await engine.payAmguInEther.value(amount).send();
  await warpEngine(provider, engine);
  await engine.thaw();
}

export async function warpEngine(
  provider: EthereumTestnetProvider,
  engine: Engine,
) {
  const delay = await engine.getThawDelay();
  const warp = delay.add(1).toNumber();
  await provider.send('evm_increaseTime', [warp]);
  await provider.send('evm_mine', []);
}
