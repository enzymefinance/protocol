import { StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('transfer', () => {
  it('can transfer own tokens to another user', async () => {
    const [fundOwner, investor, transferee] = fork.accounts;
    const denominationAsset = new StandardToken(fork.config.weth, provider);

    // Spin up and invest in a fund to create shares
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      investment: {
        buyer: investor,
        provider,
        seedBuyer: true,
      },
      signer: fundOwner,
    });

    const preTxInvestorBalance = await vaultProxy.balanceOf(investor);

    const amountToTransfer = preTxInvestorBalance.div(4);

    expect(amountToTransfer).toBeGtBigNumber(0);

    // Execute the transfer
    await vaultProxy.connect(investor).transfer(transferee, amountToTransfer);

    // Assert the correct amount was sent and received by the recipient
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(preTxInvestorBalance.sub(amountToTransfer));
    expect(await vaultProxy.balanceOf(transferee)).toEqBigNumber(amountToTransfer);

    // Assert the hook was correctly called
    expect(comptrollerProxy.preTransferSharesHook).toHaveBeenCalledOnContractWith(
      investor,
      transferee,
      amountToTransfer,
    );
  });
});

describe('transferFrom', () => {
  it('can transfer tokens on behalf of another user when granted an allowance', async () => {
    const [fundOwner, investor, transferee, approvedCaller] = fork.accounts;
    const denominationAsset = new StandardToken(fork.config.weth, provider);

    // Spin up and invest in a fund to create shares
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      investment: {
        buyer: investor,
        provider,
        seedBuyer: true,
      },
      signer: fundOwner,
    });

    const preTxInvestorBalance = await vaultProxy.balanceOf(investor);

    const amountToTransfer = preTxInvestorBalance.div(4);

    expect(amountToTransfer).toBeGtBigNumber(0);

    // Transfer should fail prior to granting allowance
    await expect(
      vaultProxy.connect(approvedCaller).transferFrom(investor, transferee, amountToTransfer),
    ).rejects.toBeRevertedWith('transfer amount exceeds allowance');

    // Approve 3rd party allowance
    await vaultProxy.connect(investor).approve(approvedCaller, amountToTransfer);

    // Execute the transfer
    await vaultProxy.connect(approvedCaller).transferFrom(investor, transferee, amountToTransfer);

    // Assert the correct amount was sent and received by the recipient
    expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(preTxInvestorBalance.sub(amountToTransfer));
    expect(await vaultProxy.balanceOf(transferee)).toEqBigNumber(amountToTransfer);

    // Assert the hook was correctly called
    expect(comptrollerProxy.preTransferSharesHook).toHaveBeenCalledOnContractWith(
      investor,
      transferee,
      amountToTransfer,
    );
  });
});
