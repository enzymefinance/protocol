import { randomAddress } from '@enzymefinance/ethers';
import {
  feeManagerConfigArgs,
  MockReentrancyToken,
  ReleaseStatusTypes,
  StandardToken,
  WETH,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  assertEvent,
  buyShares,
  createFundDeployer,
  createMigratedFundConfig,
  createNewFund,
  deployProtocolFixture,
  generateRegisteredMockFees,
  getAssetBalances,
  getAssetUnit,
  redeemSharesForSpecificAssets,
  redeemSharesInKind,
} from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    deployment,
    config,
    accounts: [fundOwner, ...remainingAccounts],
  } = await deployProtocolFixture();

  const weth = new WETH(config.weth, whales.weth);
  const fees = await generateRegisteredMockFees({
    deployer,
    feeManager: deployment.feeManager,
  });

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: weth,
  });

  const reentrancyToken = await MockReentrancyToken.deploy(deployer);
  await deployment.chainlinkPriceFeed.addPrimitives(
    [reentrancyToken],
    [config.chainlink.aggregators.dai[0]],
    [config.chainlink.aggregators.dai[1]],
  );

  // Seed some accounts with some weth.
  const seedAmount = utils.parseEther('100');
  const seedAccounts = [fundOwner, remainingAccounts[0], remainingAccounts[1]];
  await Promise.all(seedAccounts.map((account) => weth.transfer(account.address, seedAmount)));

  return {
    weth,
    fees,
    deployer,
    accounts: remainingAccounts,
    config,
    deployment,
    reentrancyToken,
    fund: {
      denominationAsset: weth,
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

describe('buyShares', () => {
  it('does not allow re-entrance', async () => {
    const {
      deployment: { fundDeployer },
      accounts: [fundOwner, buyer],
      reentrancyToken: denominationAsset,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
    });

    const investmentAmount = 1;
    await denominationAsset.mintFor(buyer, investmentAmount);
    await denominationAsset.makeItReentracyToken(comptrollerProxy);
    await expect(
      buyShares({
        comptrollerProxy,
        buyer,
        denominationAsset,
        investmentAmount,
      }),
    ).rejects.toBeRevertedWith('Re-entrance');
  });

  it('does not allow a fund that is pending migration', async () => {
    const {
      deployer,
      accounts: [buyer],
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      deployment: {
        assetFinalityResolver,
        chainlinkPriceFeed,
        dispatcher,
        feeManager,
        debtPositionManager,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
      fund: { comptrollerProxy: prevComptrollerProxy, denominationAsset, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Create a new FundDeployer to migrate to
    const nextFundDeployer = await createFundDeployer({
      deployer,
      assetFinalityResolver,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      debtPositionManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    // Create fund config on the new FundDeployer to migrate to
    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
    });

    // Signal migration
    await nextFundDeployer.connect(fundOwner).signalMigration(vaultProxy, nextComptrollerProxy);

    // buyShares() should fail while migration is pending
    await expect(
      buyShares({
        comptrollerProxy: prevComptrollerProxy,
        buyer,
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith('Pending migration');

    // If the migration is cancelled, buyShares() should succeed again
    await nextFundDeployer.connect(fundOwner).cancelMigration(vaultProxy);
    await expect(
      buyShares({
        comptrollerProxy: prevComptrollerProxy,
        buyer,
        denominationAsset,
      }),
    ).resolves.toBeReceipt();
  });

  it.todo('does not allow an asset that fails to reach settlement finality (e.g., an unsettleable Synth)');

  it('works for a fund with no extensions', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundOwner, buyer],
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
    });

    const investmentAmount = (await getAssetUnit(denominationAsset)).mul(2);
    const receipt = await buyShares({
      comptrollerProxy,
      buyer,
      denominationAsset,
      investmentAmount,
    });

    // Assert Events
    assertEvent(receipt, 'SharesBought', {
      buyer: await buyer.getAddress(),
      investmentAmount,
      sharesIssued: investmentAmount,
      sharesReceived: investmentAmount,
    });

    // Assert calls on ComptrollerProxy
    const calcGavCall = await comptrollerProxy.calcGav.args(true).call();
    expect(calcGavCall).toMatchFunctionOutput(comptrollerProxy.calcGav, {
      gav_: investmentAmount,
      isValid_: true,
    });

    const calcGrossShareValueCall = await comptrollerProxy.calcGrossShareValue.call();
    expect(calcGrossShareValueCall).toMatchFunctionOutput(comptrollerProxy.calcGrossShareValue, {
      grossShareValue_: utils.parseEther('1'),
      isValid_: true,
    });

    // Assert calls on VaultProxy
    // TODO: does this belong here?
    const sharesBuyerBalanceCall = await vaultProxy.balanceOf(buyer);
    expect(sharesBuyerBalanceCall).toEqBigNumber(investmentAmount);
    const sharesTotalSupplyCall = await vaultProxy.totalSupply();
    expect(sharesTotalSupplyCall).toEqBigNumber(sharesBuyerBalanceCall);
    const trackedAssetsCall = await vaultProxy.getTrackedAssets();
    expect(trackedAssetsCall).toContain(denominationAsset.address);
    const isTrackedAssetCall = await vaultProxy.isTrackedAsset(denominationAsset);
    expect(isTrackedAssetCall).toBe(true);
  });

  it('works for a fund with a non-18 decimal denominationAsset', async () => {
    const {
      deployment: { fundDeployer },
      fund: { denominationAsset },
      accounts: [fundOwner, buyer],
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
    });

    // Define the investment and expected shares amounts.
    // For 1 unit (10^decimals()) of the denominationAsset, 1 shares unit (10^18) is expected.
    const investmentAmount = utils.parseUnits('1', await denominationAsset.decimals());
    const expectedSharesAmount = utils.parseEther('1');
    const receipt = await buyShares({
      comptrollerProxy,
      buyer,
      denominationAsset,
      investmentAmount,
    });

    // Assert correct event was emitted
    assertEvent(receipt, 'SharesBought', {
      buyer: await buyer.getAddress(),
      investmentAmount,
      sharesIssued: expectedSharesAmount,
      sharesReceived: expectedSharesAmount,
    });

    // Assert GAV is the investment amount
    const calcGavCall = await comptrollerProxy.calcGav.args(true).call();
    expect(calcGavCall).toMatchFunctionOutput(comptrollerProxy.calcGav, {
      gav_: investmentAmount,
      isValid_: true,
    });

    // Assert gross share value is the investment amount
    const calcGrossShareValueCall = await comptrollerProxy.calcGrossShareValue.call();
    expect(calcGrossShareValueCall).toMatchFunctionOutput(comptrollerProxy.calcGrossShareValue, {
      grossShareValue_: investmentAmount,
      isValid_: true,
    });

    // Assert the correct amount of shares was minted to the buyer
    const sharesBuyerBalanceCall = await vaultProxy.balanceOf(buyer);
    expect(sharesBuyerBalanceCall).toEqBigNumber(expectedSharesAmount);
  });

  it('does not allow a paused release, unless overridePause is set', async () => {
    const {
      deployment: { fundDeployer },
      fund: { denominationAsset },
      accounts: [fundOwner, buyer],
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      fundOwner,
      denominationAsset,
    });

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    // The call should fail
    await expect(
      buyShares({
        comptrollerProxy,
        buyer,
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith('Fund is paused');

    // Override the pause
    await comptrollerProxy.connect(fundOwner).setOverridePause(true);

    // The call should then succeed
    await expect(
      buyShares({
        comptrollerProxy,
        buyer,
        denominationAsset,
      }),
    ).resolves.toBeReceipt();
  });
});

describe('redeem', () => {
  describe('__redeemSharesSetup', () => {
    it('does not allow a _sharesQuantity of 0', async () => {
      const {
        accounts: [investor],
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        redeemSharesInKind({ comptrollerProxy, signer: investor, quantity: utils.parseEther('0') }),
      ).rejects.toBeRevertedWith('No shares to redeem');
    });

    it('does not allow a _sharesQuantity greater than the redeemer balance', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer },
        accounts: [fundManager, investor],
      } = await provider.snapshot(snapshot);

      // Create a new fund, and invested in equally by the fund manager and an investor
      const investmentAmount = await getAssetUnit(denominationAsset);
      const { comptrollerProxy } = await createNewFund({
        signer: fundManager,
        fundDeployer,
        denominationAsset,
        investment: {
          buyer: fundManager,
          investmentAmount,
        },
      });

      await buyShares({
        comptrollerProxy,
        buyer: investor,
        denominationAsset,
        investmentAmount,
      });

      const redeemQuantity = investmentAmount.add(1);

      await expect(
        redeemSharesInKind({
          comptrollerProxy,
          signer: investor,
          quantity: redeemQuantity,
        }),
      ).rejects.toBeRevertedWith('Insufficient shares');
    });
  });

  describe('redeemSharesForSpecificAssets', () => {
    it.todo('cannot be re-entered');

    it('does not allow unequal arrays of assets and asset percentages', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer },
        accounts: [fundOwner, investor],
      } = await provider.snapshot(snapshot);

      const { comptrollerProxy } = await createNewFund({
        signer: fundOwner,
        fundOwner,
        fundDeployer,
        denominationAsset,
      });

      await expect(
        redeemSharesForSpecificAssets({
          comptrollerProxy,
          signer: investor,
          payoutAssets: [],
          payoutAssetPercentages: [1],
        }),
      ).rejects.toBeRevertedWith('Unequal arrays');
    });

    it('does not allow duplicate payoutAssets', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer },
        accounts: [fundOwner, investor],
      } = await provider.snapshot(snapshot);

      const { comptrollerProxy } = await createNewFund({
        signer: fundOwner,
        fundOwner,
        fundDeployer,
        denominationAsset,
      });

      await expect(
        redeemSharesForSpecificAssets({
          comptrollerProxy,
          signer: investor,
          payoutAssets: [constants.AddressZero, constants.AddressZero],
          payoutAssetPercentages: [50, 50],
        }),
      ).rejects.toBeRevertedWith('Duplicate payout asset');
    });

    it.todo('does not allow an invalid GAV');

    it.todo('does not allow an invalid rate for a specified asset');

    it('does not allow the aggregate asset percentages to be greater or less than 100%', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer },
        accounts: [fundOwner, investor],
        config: {
          primitives: { mln },
        },
      } = await provider.snapshot(snapshot);

      const { comptrollerProxy, vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundOwner,
        fundDeployer,
        denominationAsset,
        investment: {
          buyer: investor,
        },
      });

      // Send second asset to the fund
      const secondAsset = new StandardToken(mln, whales.mln);
      const secondAssetTransferAmount = await getAssetUnit(secondAsset);
      await secondAsset.transfer(vaultProxy, secondAssetTransferAmount);

      await expect(
        redeemSharesForSpecificAssets({
          comptrollerProxy,
          signer: investor,
          payoutAssets: [denominationAsset, secondAsset],
          payoutAssetPercentages: [10000, 1],
        }),
      ).rejects.toBeRevertedWith('Percents must total 100%');

      await expect(
        redeemSharesForSpecificAssets({
          comptrollerProxy,
          signer: investor,
          payoutAssets: [denominationAsset],
          payoutAssetPercentages: [9999],
        }),
      ).rejects.toBeRevertedWith('Percents must total 100%');
    });

    it('handles a valid call: full shares balance', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer, integrationManager, valueInterpreter },
        accounts: [fundOwner, investor],
        config: {
          primitives: { dai, mln },
        },
      } = await provider.snapshot(snapshot);

      // Create a new fund, invested in by the fund manager and an investor
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundOwner,
        fundDeployer,
        denominationAsset,
        investment: {
          buyer: fundOwner,
        },
      });

      // Buy a relatively small amount of shares for the investor to guarantee they can redeem the specified asset balances
      const investorInvestmentAmount = (await getAssetUnit(denominationAsset)).div(10);
      await buyShares({
        comptrollerProxy,
        buyer: investor,
        denominationAsset,
        investmentAmount: investorInvestmentAmount,
      });

      // Define the redemption parameters
      const recipient = randomAddress();
      const payoutAssets = [new StandardToken(mln, whales.mln), new StandardToken(dai, whales.dai)];
      const oneHundredPercent = 10000;
      const payoutAssetPercentages = [3000, 7000]; // 30% and 70%

      // Send and track the redemption assets with the equivalent values as the denomination asset balance
      const preTxVaultDenominationAssetBalance = await denominationAsset.balanceOf(vaultProxy);
      await addNewAssetsToFund({
        comptrollerProxy,
        signer: fundOwner,
        integrationManager,
        assets: payoutAssets,
        amounts: await Promise.all(
          payoutAssets.map(
            async (asset) =>
              (
                await valueInterpreter.calcCanonicalAssetValue
                  .args(denominationAsset, preTxVaultDenominationAssetBalance, asset)
                  .call()
              ).value_,
          ),
        ),
      });

      // Calculate the expected shares redeemed and gav owed prior to redemption
      const expectedSharesRedeemed = await vaultProxy.balanceOf(investor);
      const preTxGav = (await comptrollerProxy.calcGav.args(true).call()).gav_;
      const gavOwed = preTxGav.mul(expectedSharesRedeemed).div(await vaultProxy.totalSupply());

      // Redeem all of the investor's shares
      const receipt = await redeemSharesForSpecificAssets({
        comptrollerProxy,
        signer: investor,
        recipient,
        quantity: constants.MaxUint256, // unnecessary, but explicit
        payoutAssets,
        payoutAssetPercentages,
      });

      // Calculate the expected payout amounts
      const expectedPayoutAmounts = await Promise.all(
        payoutAssets.map(
          async (asset, i) =>
            (
              await valueInterpreter.calcCanonicalAssetValue
                .args(denominationAsset, gavOwed.mul(payoutAssetPercentages[i]).div(oneHundredPercent), asset)
                .call()
            ).value_,
        ),
      );

      // Assert that the new GAV is roughly the old gav minus gav owed
      expect((await comptrollerProxy.calcGav.args(true).call()).gav_).toBeAroundBigNumber(preTxGav.sub(gavOwed));

      // Assert the redeemer has redeemed all shares
      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(0);

      // Assert the recipient has received the expected assets and balances
      for (const i in payoutAssets) {
        expect(await payoutAssets[i].balanceOf(recipient)).toEqBigNumber(expectedPayoutAmounts[i]);
      }

      // Assert the correct event was emitted
      assertEvent(receipt, 'SharesRedeemed', {
        redeemer: investor,
        recipient,
        sharesAmount: expectedSharesRedeemed,
        receivedAssets: payoutAssets,
        receivedAssetAmounts: expectedPayoutAmounts,
      });
    });

    it('handles a valid call: explicitly claim less than 100% of owed gav', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer, valueInterpreter },
        accounts: [fundOwner, investor],
      } = await provider.snapshot(snapshot);

      // Create a new fund, invested in by the fund manager
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundOwner,
        fundDeployer,
        denominationAsset,
        investment: {
          buyer: investor,
        },
      });

      // Define the redemption parameters
      const payoutAssets = [denominationAsset, constants.AddressZero];
      const oneHundredPercent = 10000;
      const payoutAssetPercentages = [9000, 1000]; // 90% and 10%

      // Calculate the expected shares redeemed and gav owed prior to redemption
      const expectedSharesRedeemed = (await vaultProxy.balanceOf(investor)).div(4);
      const preTxGav = (await comptrollerProxy.calcGav.args(true).call()).gav_;
      const gavOwed = preTxGav.mul(expectedSharesRedeemed).div(await vaultProxy.totalSupply());

      // Redeem part of the investor's shares
      const receipt = await redeemSharesForSpecificAssets({
        comptrollerProxy,
        signer: investor,
        quantity: expectedSharesRedeemed,
        payoutAssets,
        payoutAssetPercentages,
      });

      // Calculate the expected payout amount and expect 0 for the empty asset
      const expectedPayoutAmounts = [
        (
          await valueInterpreter.calcCanonicalAssetValue
            .args(denominationAsset, gavOwed.mul(payoutAssetPercentages[0]).div(oneHundredPercent), denominationAsset)
            .call()
        ).value_,
        0,
      ];

      // Assert the correct event was emitted
      assertEvent(receipt, 'SharesRedeemed', {
        redeemer: investor,
        recipient: investor,
        sharesAmount: expectedSharesRedeemed,
        receivedAssets: payoutAssets,
        receivedAssetAmounts: expectedPayoutAmounts,
      });

      // Other assertions are the same as the main happy path test
    });
  });

  describe('redeemSharesInKind', () => {
    it('cannot be re-entered', async () => {
      const {
        deployment: { fundDeployer },
        accounts: [fundManager, investor],
        reentrancyToken: denominationAsset,
      } = await provider.snapshot(snapshot);

      const investmentAmount = (await getAssetUnit(denominationAsset)).mul(2);
      await denominationAsset.mintFor(fundManager, investmentAmount);
      await denominationAsset.mintFor(investor, investmentAmount);

      // Create a new fund, and invested in equally by the fund manager and an investor
      const { comptrollerProxy } = await createNewFund({
        signer: fundManager,
        fundDeployer,
        denominationAsset,
        investment: {
          buyer: fundManager,
          investmentAmount,
        },
      });

      await buyShares({
        comptrollerProxy,
        denominationAsset,
        buyer: investor,
        investmentAmount,
      });

      const redeemQuantity = investmentAmount;

      await denominationAsset.makeItReentracyToken(comptrollerProxy);

      await expect(
        redeemSharesInKind({
          comptrollerProxy,
          signer: investor,
          quantity: redeemQuantity,
        }),
      ).rejects.toBeRevertedWith('Re-entrance');
    });

    it('does not allow a _sharesQuantity of 0', async () => {
      const {
        accounts: [investor],
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        redeemSharesInKind({ comptrollerProxy, signer: investor, quantity: utils.parseEther('0') }),
      ).rejects.toBeRevertedWith('No shares to redeem');
    });

    it('does not allow duplicate _additionalAssets', async () => {
      const {
        weth,
        accounts: [investor],
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        redeemSharesInKind({
          comptrollerProxy,
          signer: investor,
          quantity: utils.parseEther('1'),
          additionalAssets: [weth, weth],
        }),
      ).rejects.toBeRevertedWith('_additionalAssets contains duplicates');
    });

    it('does not allow duplicate _assetsToSkip', async () => {
      const {
        weth,
        accounts: [investor],
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        redeemSharesInKind({
          comptrollerProxy,
          signer: investor,
          quantity: utils.parseEther('1'),
          assetsToSkip: [weth, weth],
        }),
      ).rejects.toBeRevertedWith('_assetsToSkip contains duplicates');
    });

    it('handles a valid call: full shares balance, no additional config', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer, integrationManager },
        accounts: [fundOwner, investor],
        config: {
          primitives: { mln },
        },
      } = await provider.snapshot(snapshot);

      const { comptrollerProxy, vaultProxy } = await createNewFund({
        signer: fundOwner,
        fundOwner,
        fundDeployer,
        denominationAsset,
      });

      await buyShares({
        comptrollerProxy,
        buyer: investor,
        denominationAsset,
      });

      // Seed the vault with the denomination asset
      await denominationAsset.transfer(vaultProxy, 1);

      // Send and track a second asset in the vault
      const secondAsset = new StandardToken(mln, whales.mln);
      await addNewAssetsToFund({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: [secondAsset],
        amounts: [(await getAssetUnit(secondAsset)).mul(3)],
        setAsPersistentlyTracked: [false], // Allow untracking to test auto-removal
      });

      // Define the expected payout assets
      const expectedSharesRedeemed = await vaultProxy.balanceOf(investor);
      const expectedPayoutAssets = [denominationAsset, secondAsset];
      const expectedPayoutAmounts = await Promise.all(
        expectedPayoutAssets.map(async (asset) => await asset.balanceOf(vaultProxy)),
      );

      // Record the investor's pre-redemption balances
      const preTxInvestorExpectedAssetsBalances = await getAssetBalances({
        account: investor,
        assets: expectedPayoutAssets,
      });

      // Redeem all of investor's shares
      const receipt = await redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
        quantity: constants.MaxUint256, // unnecessary, but explicit
      });

      assertEvent(receipt, 'SharesRedeemed', {
        redeemer: investor,
        recipient: investor,
        sharesAmount: expectedSharesRedeemed,
        receivedAssets: expectedPayoutAssets,
        receivedAssetAmounts: expectedPayoutAmounts,
      });

      // Assert the redeemer has redeemed all shares and received the expected assets and full balances
      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(0);
      for (const i in expectedPayoutAssets) {
        expect(await expectedPayoutAssets[i].balanceOf(investor)).toEqBigNumber(
          preTxInvestorExpectedAssetsBalances[i].add(expectedPayoutAmounts[i]),
        );
      }

      // Assert that the denomination asset is the only remaining tracked asset
      expect(await vaultProxy.getTrackedAssets()).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [
        denominationAsset,
      ]);
    });

    it('handles a valid call: partial shares, one additional asset, one asset to ignore, a different recipient', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer },
        accounts: [fundManager, investor],
        config: {
          primitives: { mln },
        },
      } = await provider.snapshot(snapshot);

      // Create a new fund, and invested in equally by the fund manager and an investor
      const investmentAmount = await getAssetUnit(denominationAsset);
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        signer: fundManager,
        fundDeployer,
        denominationAsset,
        investment: {
          buyer: fundManager,
          investmentAmount,
        },
      });

      await buyShares({
        comptrollerProxy,
        buyer: investor,
        denominationAsset,
        investmentAmount,
      });

      // Send untracked asset directly to fund
      const untrackedAsset = new StandardToken(mln, whales.mln);
      const untrackedAssetBalance = utils.parseEther('2');
      await untrackedAsset.transfer(vaultProxy, untrackedAssetBalance);

      // Assert the asset is not tracked
      const isTrackedAssetCall = await vaultProxy.isTrackedAsset(untrackedAsset);
      expect(isTrackedAssetCall).toBe(false);

      // Define the redemption params and the expected payout assets
      const recipient = randomAddress();
      const redeemQuantity = investmentAmount.div(2);
      const additionalAssets = [untrackedAsset];
      const assetsToSkip = [denominationAsset];
      const expectedPayoutAssets = [untrackedAsset];
      const expectedPayoutAmounts = [untrackedAssetBalance.div(4)];

      // Record the investor's pre-redemption balances
      const [preExpectedPayoutAssetBalance, preAssetToSkipBalance] = await getAssetBalances({
        account: recipient,
        assets: [untrackedAsset, denominationAsset],
      });

      // Redeem half of investor's shares
      const receipt = await redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
        recipient,
        quantity: redeemQuantity,
        additionalAssets,
        assetsToSkip,
      });

      // Assert the event
      assertEvent(receipt, 'SharesRedeemed', {
        redeemer: investor,
        recipient,
        sharesAmount: redeemQuantity,
        receivedAssets: expectedPayoutAssets,
        receivedAssetAmounts: expectedPayoutAmounts,
      });

      const [postExpectedPayoutAssetBalance, postAssetToSkipBalance] = await getAssetBalances({
        account: recipient,
        assets: [untrackedAsset, denominationAsset],
      });

      // Assert the redeemer has redeemed the correct shares quantity and that the recipient received the expected assets and balances
      const investorSharesBalanceCall = await vaultProxy.balanceOf(investor);
      expect(investorSharesBalanceCall).toEqBigNumber(investmentAmount.sub(redeemQuantity));
      expect(postExpectedPayoutAssetBalance).toEqBigNumber(preExpectedPayoutAssetBalance.add(expectedPayoutAmounts[0]));
      expect(postAssetToSkipBalance).toEqBigNumber(preAssetToSkipBalance);
    });

    it.todo('handles a valid call: full shares balance with fee that reduces the number of sender shares');

    it('handles a preRedeemSharesHook failure', async () => {
      const {
        accounts: [fundManager, investor],
        fund: { denominationAsset },
        deployment: { fundDeployer },
        fees: { mockContinuousFeeSettleOnly },
      } = await provider.snapshot(snapshot);

      const fees = [mockContinuousFeeSettleOnly];
      const feesSettingsData = [utils.randomBytes(10)];

      const feeManagerConfig = feeManagerConfigArgs({
        fees: fees,
        settings: feesSettingsData,
      });

      const investmentAmount = (await getAssetUnit(denominationAsset)).mul(2);
      const { comptrollerProxy } = await createNewFund({
        signer: fundManager,
        fundDeployer,
        denominationAsset,
        investment: {
          buyer: investor,
          investmentAmount,
        },
        feeManagerConfig,
      });

      const invalidFeeSettlementType = 100;
      await mockContinuousFeeSettleOnly.settle.returns(
        invalidFeeSettlementType,
        constants.AddressZero,
        utils.parseEther('0.5'),
      );

      const receipt = await redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
      });

      assertEvent(receipt, 'PreRedeemSharesHookFailed', {
        failureReturnData: expect.any(String),
        redeemer: investor,
        sharesAmount: investmentAmount,
      });
    });
  });
});

describe('sharesActionTimelock', () => {
  it('does not affect buying or redeeming shares if set to 0', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
    } = await provider.snapshot(snapshot);

    // Create a new fund, without a timelock
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
    });

    const getSharesActionTimelockCall = await comptrollerProxy.getSharesActionTimelock();
    expect(getSharesActionTimelockCall).toEqBigNumber(0);

    // Buy shares to start the timelock (though the timelock is 0)
    await buyShares({
      comptrollerProxy,
      buyer: investor,
      denominationAsset,
    });

    // Immediately redeeming shares should succeed
    await redeemSharesInKind({
      comptrollerProxy,
      signer: investor,
    });
  });

  it('is respected when redeeming shares (no pending migration)', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
    } = await provider.snapshot(snapshot);

    // Transfer some weth to the investor account.

    // Create a new fund, with a timelock
    const sharesActionTimelock = 100;
    const { comptrollerProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      sharesActionTimelock,
    });

    // Buy shares to start the timelock
    await expect(
      buyShares({
        comptrollerProxy,
        buyer: investor,
        denominationAsset,
      }),
    ).resolves.toBeReceipt();

    // Redeeming shares for the same user should fail since the timelock has started
    await expect(
      redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
      }),
    ).rejects.toBeRevertedWith('Shares action timelocked');

    // Warping forward to the timelock should allow a redemption
    await provider.send('evm_increaseTime', [sharesActionTimelock]);

    await expect(
      redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
      }),
    ).resolves.toBeReceipt();
  });

  it('is skipped when redeeming shares if there is a pending migration', async () => {
    const {
      deployer,
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      deployment: {
        assetFinalityResolver,
        chainlinkPriceFeed,
        debtPositionManager,
        dispatcher,
        feeManager,
        fundDeployer,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
      fund: { denominationAsset },
      accounts: [fundOwner, investor],
    } = await provider.snapshot(snapshot);

    const failureMessage = 'Shares action timelocked';

    // Create a new fund, with a timelock
    const sharesActionTimelock = 100;
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      sharesActionTimelock,
    });

    // Buy shares to start the timelock
    await expect(
      buyShares({
        comptrollerProxy,
        buyer: investor,
        denominationAsset,
      }),
    ).resolves.toBeReceipt();

    // Immediately attempting to redeem shares should fail
    await expect(
      redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
      }),
    ).rejects.toBeRevertedWith(failureMessage);

    // Create a new FundDeployer to migrate to
    const nextFundDeployer = await createFundDeployer({
      deployer,
      assetFinalityResolver,
      chainlinkPriceFeed,
      debtPositionManager,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    // Create fund config on the new FundDeployer to migrate to
    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
    });

    // Signal migration
    await nextFundDeployer.connect(fundOwner).signalMigration(vaultProxy, nextComptrollerProxy);

    // Redeeming shares should succeed now that the fund has a migration pending
    await expect(
      redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
      }),
    ).resolves.toBeReceipt();
  });
});
