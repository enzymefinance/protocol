import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const vaultLib = fork.deployment.vaultLib;

    expect(await vaultLib.getMlnToken()).toMatchAddress(fork.config.primitives.mln);
    expect(await vaultLib.getProtocolFeeReserve()).toMatchAddress(fork.deployment.protocolFeeReserveProxy);
    expect(await vaultLib.getProtocolFeeTracker()).toMatchAddress(fork.deployment.protocolFeeTracker);
    expect(await vaultLib.getWethToken()).toMatchAddress(fork.config.weth);

    // GasRelayRecipientMixin
    expect(await vaultLib.getGasRelayPaymasterFactory()).toMatchAddress(fork.deployment.gasRelayPaymasterFactory);

    // SharesToken values
    const nameValue = await vaultLib.name();
    expect(nameValue).toBe('');

    // TODO: symbol

    const decimalsValue = await vaultLib.decimals();
    expect(decimalsValue).toBe(18);
  });
});
