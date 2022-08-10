import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('buyBackSharesViaTrustedVaultProxy', () => {
  it('happy path', async () => {
    const [vaultProxySigner] = fork.accounts;
    const protocolFeeReserveProxy = fork.deployment.protocolFeeReserveProxy;

    // Inputs
    const sharesAmount = utils.parseEther('3'); // Amount only used in event
    const mlnValue = utils.parseEther('4');
    const gav = 1; // Not currently used

    // Expected values
    // Global discount is 50%
    const expectedMlnAmountToBurn = mlnValue.div(2);

    // Call the function without a tx first to assert return value
    const mlnAmountToBurn = await protocolFeeReserveProxy.buyBackSharesViaTrustedVaultProxy
      .args(sharesAmount, mlnValue, gav)
      .from(vaultProxySigner) // Not strictly necessary
      .call();

    expect(mlnAmountToBurn).toEqBigNumber(expectedMlnAmountToBurn);

    const receipt = await protocolFeeReserveProxy
      .connect(vaultProxySigner)
      .buyBackSharesViaTrustedVaultProxy(sharesAmount, mlnValue, gav);

    assertEvent(receipt, 'SharesBoughtBack', {
      mlnBurned: mlnAmountToBurn,
      mlnValue,
      sharesAmount,
      vaultProxy: vaultProxySigner,
    });
  });
});
