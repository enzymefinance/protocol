import { randomAddress } from '@enzymefinance/ethers';
import { encodeArgs, PolicyHook, StandardToken } from '@enzymefinance/protocol';
import { createNewFund, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('preTransferSharesHook', () => {
  it('cannot be directly called by the owner', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(comptrollerProxy.preTransferSharesHook(randomAddress(), randomAddress(), 1)).rejects.toBeRevertedWith(
      'Only VaultProxy callable',
    );
  });

  it('calls the PolicyManager with the expected args, and is only callable after the sharesActionTimelock has expired', async () => {
    const [fundOwner, investor, transferee] = fork.accounts;
    const denominationAsset = new StandardToken(fork.config.weth, whales.weth);

    // Spin up and invest in a fund to create shares
    const sharesActionTimelock = 1000;
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      sharesActionTimelock,
      investment: {
        buyer: investor,
        seedBuyer: true,
      },
    });

    const preTxInvestorBalance = await vaultProxy.balanceOf(investor);

    const amountToTransfer = preTxInvestorBalance.div(4);
    expect(amountToTransfer).toBeGtBigNumber(0);

    // Transfer should fail during the timelock
    await expect(vaultProxy.connect(investor).transfer(transferee, amountToTransfer)).rejects.toBeRevertedWith(
      'Shares action timelocked',
    );

    // Warp ahead of the timelock
    await provider.send('evm_increaseTime', [sharesActionTimelock]);

    // Execute the transfer
    await vaultProxy.connect(investor).transfer(transferee, amountToTransfer);

    // Assert the PolicyManager was correctly called
    expect(fork.deployment.policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PreTransferShares,
      encodeArgs(['address', 'address', 'uint256'], [investor, transferee, amountToTransfer]),
    );
  });
});
