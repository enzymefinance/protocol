import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture } from '@enzymefinance/testutils';
import { constants } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const vaultLib = fork.deployment.vaultLib;

    expect(await vaultLib.getMlnToken()).toMatchAddress(fork.config.feeToken);
    expect(await vaultLib.getPositionsLimit()).toEqBigNumber(fork.config.positionsLimit);
    expect(await vaultLib.getProtocolFeeReserve()).toMatchAddress(fork.deployment.protocolFeeReserveProxy);
    expect(await vaultLib.getProtocolFeeTracker()).toMatchAddress(fork.deployment.protocolFeeTracker);
    expect(await vaultLib.getWethToken()).toMatchAddress(fork.config.weth);

    let mlnBurner = constants.AddressZero;

    if (!fork.config.feeTokenBurn.burnFromVault) {
      if (fork.config.feeTokenBurn.sendToProtocolFeeReserve) {
        mlnBurner = fork.deployment.protocolFeeReserveProxy.address;
      } else {
        mlnBurner = fork.config.feeTokenBurn.externalBurnerAddress;
      }
    }

    expect(await vaultLib.getMlnBurner()).toBe(mlnBurner);

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
