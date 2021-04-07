import { StandardToken } from '@enzymefinance/protocol';
import { createNewFund, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('transfer', () => {
  it('can transfer own tokens to another user', async () => {
    const [fundOwner, investor, transferee] = fork.accounts;
    const denominationAsset = new StandardToken(fork.config.weth, whales.weth);

    // Spin up and invest in a fund to create shares
    const investmentAmount = utils.parseUnits('1', await denominationAsset.decimals());
    await denominationAsset.transfer(investor, investmentAmount);
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      investment: {
        signer: investor,
        buyers: [investor],
        investmentAmounts: [investmentAmount],
      },
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
    const denominationAsset = new StandardToken(fork.config.weth, whales.weth);

    // Spin up and invest in a fund to create shares
    const investmentAmount = utils.parseUnits('1', await denominationAsset.decimals());
    await denominationAsset.transfer(investor, investmentAmount);
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      investment: {
        signer: investor,
        buyers: [investor],
        investmentAmounts: [investmentAmount],
      },
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
