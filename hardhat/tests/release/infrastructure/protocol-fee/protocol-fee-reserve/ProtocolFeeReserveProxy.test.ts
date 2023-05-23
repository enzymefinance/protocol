import { randomAddress } from '@enzymefinance/ethers';
import type { ProtocolFeeReserveLib } from '@enzymefinance/protocol';
import { encodeFunctionData, ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture, getAssetUnit, setAccountBalance } from '@enzymefinance/testutils';
import type { BigNumber, BytesLike } from 'ethers';
import { utils } from 'ethers';

let protocolFeeReserveProxy: ProtocolFeeReserveLib;
let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  protocolFeeReserveProxy = fork.deployment.protocolFeeReserveProxy;
});

describe('buyBackSharesViaTrustedVaultProxy', () => {
  it('happy path', async () => {
    const [vaultProxySigner] = fork.accounts;

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

describe('callOnContract', () => {
  // Uses a simple token transfer to validate the arbitrary call works with access control

  const freshRecipient = randomAddress();
  let council: SignerWithAddress;
  let token: ITestStandardToken;
  let tokenTransferAmount: BigNumber;
  let tokenTransferPayload: BytesLike;

  beforeEach(async () => {
    [council] = fork.accounts;
    const dispatcher = fork.deployment.dispatcher;

    // Token
    token = new ITestStandardToken(fork.config.primitives.mln, provider);
    tokenTransferAmount = (await getAssetUnit(token)).mul(5);

    // Seed the ProtocolFeeReserve with the token
    await setAccountBalance({ account: protocolFeeReserveProxy, amount: tokenTransferAmount.mul(3), provider, token });

    tokenTransferPayload = encodeFunctionData(token.transfer.fragment, [freshRecipient, tokenTransferAmount]);

    // Set the new Council signer
    // TODO: we should do this elsewhere when we want to validate the Council (to disambiguate the "deployer" from the "Council")
    await dispatcher.setNominatedOwner(council);
    await dispatcher.connect(council).claimOwnership();
  });

  it('can only be called by the Council', async () => {
    expect(protocolFeeReserveProxy.callOnContract(token, tokenTransferPayload)).rejects.toBeRevertedWith(
      'Only the Dispatcher owner can call this function',
    );
  });

  it('happy path', async () => {
    const preTxBal = await token.balanceOf(protocolFeeReserveProxy);

    await protocolFeeReserveProxy.connect(council).callOnContract(token, tokenTransferPayload);

    // Token balances of the ProtocolFeeReserve and the recipient should have updated
    expect(await token.balanceOf(protocolFeeReserveProxy)).toEqBigNumber(preTxBal.sub(tokenTransferAmount));
    expect(await token.balanceOf(freshRecipient)).toEqBigNumber(tokenTransferAmount);
  });
});
