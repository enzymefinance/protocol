import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib } from '@enzymefinance/protocol';
import { StandardToken, TestUpdatableFeeRecipientBase } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { constants } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('setRecipientForFund', () => {
  const feeRecipient = randomAddress();
  let updatableFeeRecipientBase: TestUpdatableFeeRecipientBase;
  let fundOwner: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;

    const newFundRes = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });
    comptrollerProxy = newFundRes.comptrollerProxy;

    // util is not a FeeBase so cannot be added to the fund as a real fee
    updatableFeeRecipientBase = await TestUpdatableFeeRecipientBase.deploy(fork.deployer);
  });

  it('can only be called by the fund owner', async () => {
    await expect(
      updatableFeeRecipientBase.setRecipientForFund(comptrollerProxy, feeRecipient),
    ).rejects.toBeRevertedWith('Only vault owner callable');
  });

  it('correctly handles valid call', async () => {
    // Fee recipient should be empty
    expect(await updatableFeeRecipientBase.getRecipientForFund(comptrollerProxy)).toMatchAddress(constants.AddressZero);

    const receipt = await updatableFeeRecipientBase
      .connect(fundOwner)
      .setRecipientForFund(comptrollerProxy, feeRecipient);

    // Fee recipient should now be set
    expect(await updatableFeeRecipientBase.getRecipientForFund(comptrollerProxy)).toMatchAddress(feeRecipient);

    // Assert the correct event was emitted
    assertEvent(receipt, 'RecipientSetForFund', {
      comptrollerProxy,
      recipient: feeRecipient,
    });
  });
});
