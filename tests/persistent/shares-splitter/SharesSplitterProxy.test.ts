import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, SharesSplitterFactory, SharesSplitterLib, VaultLib } from '@enzymefinance/protocol';
import { encodeArgs, ONE_HUNDRED_PERCENT_IN_BPS, sighash, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { buyShares, createNewFund, deployProtocolFixture, deploySharesSplitter } from '@enzymefinance/testutils';
import type { BigNumber, BigNumberish } from 'ethers';
import { utils } from 'ethers';

// All core functionality to the inherited TreasurySplitterMixin is tested in that contract's tests

const randomAddressValue = randomAddress();
let fork: ProtocolDeployment;
let sharesSplitterFactory: SharesSplitterFactory;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  sharesSplitterFactory = fork.deployment.sharesSplitterFactory;
});

describe('init', () => {
  it('cannot be called by a random caller', async () => {
    const { sharesSplitterProxy } = await deploySharesSplitter({
      sharesSplitterFactory,
      signer: fork.deployer,
      splitPercentages: [ONE_HUNDRED_PERCENT_IN_BPS],
      splitUsers: [randomAddressValue],
    });

    await expect(
      sharesSplitterProxy.connect(fork.deployer).init([randomAddressValue], [ONE_HUNDRED_PERCENT_IN_BPS]),
    ).rejects.toBeRevertedWith('Unauthorized');
  });

  // Split ratio assertions tested in factory and TreasurySplitterMixin test suites
});

describe('redeemShares', () => {
  let sharesSplitterProxy: SharesSplitterLib;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let denominationAsset: StandardToken;
  let fundOwner: SignerWithAddress, user1: SignerWithAddress;
  let feePercent1: BigNumberish;
  let initialSharesSplitterSharesBal: BigNumber, user1ClaimableSharesAmount: BigNumber;

  beforeEach(async () => {
    [fundOwner, user1] = fork.accounts;
    feePercent1 = 2500;
    const feePercent2 = 7500;

    // Deploy a new shares splitter
    const newSharesSplitterRes = await deploySharesSplitter({
      sharesSplitterFactory,
      signer: fork.deployer,
      splitPercentages: [feePercent1, feePercent2],
      splitUsers: [user1, randomAddress()],
    });

    sharesSplitterProxy = newSharesSplitterRes.sharesSplitterProxy;

    // Deploy a new fund
    denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const newFundRes = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    // Buy some shares of the fund and send them to the SharesSplitterProxy
    await buyShares({
      buyer: fundOwner,
      comptrollerProxy,
      denominationAsset,
      seedBuyer: true,
    });
    const sharesToTransfer = await vaultProxy.balanceOf(fundOwner);

    await vaultProxy.connect(fundOwner).transfer(sharesSplitterProxy, sharesToTransfer);

    initialSharesSplitterSharesBal = await vaultProxy.balanceOf(sharesSplitterProxy);
    expect(initialSharesSplitterSharesBal).toBeGtBigNumber(0);

    user1ClaimableSharesAmount = initialSharesSplitterSharesBal.mul(feePercent1).div(ONE_HUNDRED_PERCENT_IN_BPS);
  });

  it('does not allow a call without a claimable amount of shares', async () => {
    // fundOwner has no split percentage
    await expect(
      sharesSplitterProxy.connect(fundOwner).redeemShares(vaultProxy, 0, comptrollerProxy, utils.randomBytes(4), '0x'),
    ).rejects.toBeRevertedWith('No shares claimed');
  });

  it('works as expected (v4: in-kind redemption)', async () => {
    const preRedeemUser1DenominationAssetBal = await denominationAsset.balanceOf(user1);

    const redeemSharesFragment = fork.deployment.comptrollerLib.redeemSharesInKind.fragment;
    const redeemSharesData = encodeArgs(redeemSharesFragment.inputs, [user1, user1ClaimableSharesAmount, [], []]);

    // User redeems all their claimable shares via the SharesSplitterProxy
    await sharesSplitterProxy
      .connect(user1)
      .redeemShares(
        vaultProxy,
        user1ClaimableSharesAmount,
        comptrollerProxy,
        sighash(redeemSharesFragment),
        redeemSharesData,
      );

    // Assert the owed shares amount has been removed from the SharesSplitterProxy
    expect(await vaultProxy.balanceOf(sharesSplitterProxy)).toEqBigNumber(
      initialSharesSplitterSharesBal.sub(user1ClaimableSharesAmount),
    );

    // Assert the shares have been redeemed by asserting the user's balance of denomination asset has increased
    expect(await denominationAsset.balanceOf(user1)).toBeGtBigNumber(preRedeemUser1DenominationAssetBal);
  });

  it('works as expected (v4: specific-assets redemption)', async () => {
    const preRedeemUser1DenominationAssetBal = await denominationAsset.balanceOf(user1);

    const redeemSharesFragment = fork.deployment.comptrollerLib.redeemSharesForSpecificAssets.fragment;
    const redeemSharesData = encodeArgs(redeemSharesFragment.inputs, [
      user1,
      user1ClaimableSharesAmount,
      [denominationAsset],
      [ONE_HUNDRED_PERCENT_IN_BPS],
    ]);

    // User redeems all their claimable shares via the SharesSplitterProxy
    await sharesSplitterProxy
      .connect(user1)
      .redeemShares(
        vaultProxy,
        user1ClaimableSharesAmount,
        comptrollerProxy,
        sighash(redeemSharesFragment),
        redeemSharesData,
      );

    // Assert the shares have been redeemed by asserting the user's balance of denomination asset has increased
    expect(await denominationAsset.balanceOf(user1)).toBeGtBigNumber(preRedeemUser1DenominationAssetBal);
  });
});
