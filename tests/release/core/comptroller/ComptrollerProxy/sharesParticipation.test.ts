import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, FundDeployer, PolicyManager, VaultLib } from '@enzymefinance/protocol';
import {
  calcProtocolFeeSharesDue,
  encodeArgs,
  FeeHook,
  feeManagerConfigArgs,
  MockReentrancyToken,
  ONE_HUNDRED_PERCENT_IN_BPS,
  PolicyHook,
  settlePostBuySharesArgs,
  settlePreBuySharesArgs,
  settlePreRedeemSharesArgs,
  SPECIFIC_ASSET_REDEMPTION_DUMMY_FORFEIT_ADDRESS,
  StandardToken,
  validateRulePostBuySharesArgs,
  validateRuleRedeemSharesForSpecificAssetsArgs,
  WETH,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  assertEvent,
  buyShares,
  createFundDeployer,
  createMigrationRequest,
  createNewFund,
  deployProtocolFixture,
  generateMockFees,
  getAssetBalances,
  getAssetUnit,
  redeemSharesForSpecificAssets,
  redeemSharesInKind,
  seedAccount,
  transactionTimestamp,
} from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    deployment,
    config,
    accounts: [fundOwner, ...remainingAccounts],
  } = await deployProtocolFixture();

  const weth = new WETH(config.weth, provider);
  const fees = await generateMockFees({
    deployer,
  });

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: weth,
    fundDeployer: deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  const reentrancyToken = await MockReentrancyToken.deploy(deployer);

  await deployment.valueInterpreter.addPrimitives(
    [reentrancyToken],
    [config.chainlink.aggregators.dai[0]],
    [config.chainlink.aggregators.dai[1]],
  );

  // Seed some accounts with some weth.
  const seedAmount = utils.parseEther('100');
  const seedAccounts = [fundOwner, remainingAccounts[0], remainingAccounts[1]];

  await Promise.all(seedAccounts.map((account) => seedAccount({ provider, account, amount: seedAmount, token: weth })));

  return {
    accounts: remainingAccounts,
    config,
    deployer,
    deployment,
    fees,
    fund: {
      comptrollerProxy,
      denominationAsset: weth,
      fundOwner,
      vaultProxy,
    },
    reentrancyToken,
    weth,
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
      denominationAsset,
      fundDeployer,
      signer: fundOwner,
    });

    const investmentAmount = 1;

    await denominationAsset.mintFor(buyer, investmentAmount);
    await denominationAsset.makeItReentracyToken(comptrollerProxy);
    await expect(
      buyShares({
        buyer,
        comptrollerProxy,
        denominationAsset,
        investmentAmount,
        provider,
      }),
    ).rejects.toBeRevertedWith('Re-entrance');
  });

  it('does not allow a _minSharesQuantity of 0', async () => {
    const {
      accounts: [buyer],
      fund: { comptrollerProxy, denominationAsset },
    } = await provider.snapshot(snapshot);

    await expect(
      buyShares({
        buyer,
        comptrollerProxy,
        denominationAsset,
        minSharesQuantity: 0,
        provider,
      }),
    ).rejects.toBeRevertedWith('_minSharesQuantity must be >0');
  });

  it('does not allow a fund (with a shares action timelock) that is pending migration', async () => {
    const {
      deployer,
      accounts: [buyer],
      deployment,
      fund: { denominationAsset, fundOwner },
    } = await provider.snapshot(snapshot);

    // Create a new fund with a sharesActionTimelock value
    const { comptrollerProxy: prevComptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: deployment.fundDeployer,
      fundOwner,
      sharesActionTimelock: 1000,
      signer: fundOwner,
    });

    // Create a new FundDeployer to migrate to
    const nextFundDeployer = await createFundDeployer({
      deployer,
      dispatcher: deployment.dispatcher,
      externalPositionManager: deployment.externalPositionManager,
      feeManager: deployment.feeManager,
      gasRelayPaymasterFactory: deployment.gasRelayPaymasterFactory,
      integrationManager: deployment.integrationManager,
      policyManager: deployment.policyManager,
      valueInterpreter: deployment.valueInterpreter,
      vaultLib: deployment.vaultLib,
    });

    // Create fund config on the new FundDeployer to migrate to
    await createMigrationRequest({
      denominationAsset,
      fundDeployer: nextFundDeployer,
      signer: fundOwner,
      vaultProxy,
    });

    // buyShares() should fail while migration is pending
    await expect(
      buyShares({
        buyer,
        comptrollerProxy: prevComptrollerProxy,
        denominationAsset,
        provider,
      }),
    ).rejects.toBeRevertedWith('Pending migration');

    // If the migration is cancelled, buyShares() should succeed again
    await nextFundDeployer.connect(fundOwner).cancelMigration(vaultProxy, false);
    await expect(
      buyShares({
        buyer,
        comptrollerProxy: prevComptrollerProxy,
        denominationAsset,
        provider,
      }),
    ).resolves.toBeReceipt();
  });

  it.todo('does not allow a fund (with a shares action timelock) that is pending a reconfiguration');

  it('happy path: no fund-level fees, first investment (i.e., no protocol fee)', async () => {
    const {
      fund: { denominationAsset },
      deployment: { feeManager, fundDeployer, policyManager, protocolFeeTracker },
      accounts: [fundOwner, buyer],
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer,
      signer: fundOwner,
    });

    // Define the investment and expected shares amounts.
    // For 2 units (10^decimals()) of the denominationAsset, 2 shares unit (2 * 10^18) is expected,
    // since there are no fund-level fees and protocol fee not charged on 0 shares supply
    const investmentAmount = utils.parseUnits('2', await denominationAsset.decimals());
    const expectedSharesAmount = utils.parseEther('2');
    const expectedGav = investmentAmount;

    const receipt = await buyShares({
      provider,
      buyer,
      comptrollerProxy,
      denominationAsset,
      investmentAmount,
    });

    // Assert Events
    assertEvent(receipt, 'SharesBought', {
      buyer: await buyer.getAddress(),
      investmentAmount,
      sharesIssued: expectedSharesAmount,
      sharesReceived: expectedSharesAmount,
    });

    // Assert shares were minted correctly
    const sharesBuyerBalance = await vaultProxy.balanceOf(buyer);

    expect(sharesBuyerBalance).toEqBigNumber(expectedSharesAmount);
    expect(await vaultProxy.totalSupply()).toEqBigNumber(sharesBuyerBalance);

    // Assert correct GAV and gross share value calcs
    expect(await comptrollerProxy.calcGav.call()).toEqBigNumber(expectedGav);
    expect(await comptrollerProxy.calcGrossShareValue.call()).toEqBigNumber(utils.parseEther('1'));

    // Assert the protocol fee payment was attempted
    expect(protocolFeeTracker.payFee).toHaveBeenCalledOnContract();

    // Assert the FeeManager was called with the correct data
    expect(feeManager.invokeHook).toHaveBeenCalledOnContractWith(
      FeeHook.PreBuyShares,
      settlePreBuySharesArgs({ buyer, investmentAmount }),
      0, // No GAV since first investment
    );
    expect(feeManager.invokeHook).toHaveBeenCalledOnContractWith(
      FeeHook.PostBuyShares,
      settlePostBuySharesArgs({ buyer, investmentAmount, sharesBought: expectedSharesAmount }),
      expectedGav,
    );

    // Assert the PolicyManager was called with the correct data
    expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      PolicyHook.PostBuyShares,
      validateRulePostBuySharesArgs({
        buyer,
        fundGav: expectedGav,
        investmentAmount,
        sharesIssued: expectedSharesAmount,
      }),
    );
  });

  it('happy path: no fund-level fees, second investment (i.e., with a protocol fee)', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer, protocolFeeTracker },
      accounts: [fundOwner, buyer],
    } = await provider.snapshot(snapshot);

    const investmentAmount = (await getAssetUnit(denominationAsset)).mul(2);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer,
      // Invest the 1st time to give a positive supply of shares
      investment: {
        buyer: fundOwner,
        investmentAmount,
        provider,
      },

      signer: fundOwner,
    });

    // Warp time so that a protocol fee will be due
    await provider.send('evm_increaseTime', [3600]);

    const preTxLastPaidTimestamp = await protocolFeeTracker.getLastPaidForVault(vaultProxy);
    const preTxSharesSupply = await vaultProxy.totalSupply();

    const receipt = await buyShares({
      buyer,
      comptrollerProxy,
      denominationAsset,
      investmentAmount,
      provider,
    });

    // Expected values
    const expectedProtocolFee = await calcProtocolFeeSharesDue({
      protocolFeeTracker,
      secondsSinceLastPaid: BigNumber.from(await transactionTimestamp(receipt)).sub(preTxLastPaidTimestamp),
      sharesSupply: preTxSharesSupply,
      vaultProxyAddress: vaultProxy,
    });

    expect(expectedProtocolFee).toBeGtBigNumber(0);
    // Share price after the tx is the same as the share price during the time of shares issuance,
    // since protocol fee has already been collected at that time.
    const sharePrice = await comptrollerProxy.calcGrossShareValue.call();
    const expectedSharesReceived = investmentAmount.mul(utils.parseEther('1')).div(sharePrice);

    // Assert shares were minted correctly.
    const sharesBuyerBalance = await vaultProxy.balanceOf(buyer);

    expect(sharesBuyerBalance).toEqBigNumber(expectedSharesReceived);

    const expectedSharesSupply = preTxSharesSupply.add(sharesBuyerBalance).add(expectedProtocolFee);

    expect(await vaultProxy.totalSupply()).toEqBigNumber(expectedSharesSupply);

    // Other assertions same as made in previous test
  });

  it('happy path: no shares action timelock, pending migration', async () => {
    const {
      deployer,
      accounts: [buyer],
      deployment,
      fund: { denominationAsset, fundOwner },
    } = await provider.snapshot(snapshot);

    // Create a new fund without a sharesActionTimelock value
    const { comptrollerProxy: prevComptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: deployment.fundDeployer,
      fundOwner,
      sharesActionTimelock: 0,
      signer: fundOwner, // Not necessary, but explicit
    });

    const nextFundDeployer = await createFundDeployer({
      deployer,
      dispatcher: deployment.dispatcher,
      externalPositionManager: deployment.externalPositionManager,
      feeManager: deployment.feeManager,
      gasRelayPaymasterFactory: deployment.gasRelayPaymasterFactory,
      integrationManager: deployment.integrationManager,
      policyManager: deployment.policyManager,
      valueInterpreter: deployment.valueInterpreter,
      vaultLib: deployment.vaultLib,
    });

    await createMigrationRequest({
      denominationAsset,
      fundDeployer: nextFundDeployer,
      signer: fundOwner,
      vaultProxy,
    });

    // Buying shares should still work during a pending migration
    await buyShares({
      provider,
      buyer,
      comptrollerProxy: prevComptrollerProxy,
      denominationAsset,
    });
  });

  it.todo('happy path: no shares action timelock, pending reconfiguration');
});

describe('buySharesOnBehalf', () => {
  const investmentAmount = BigNumber.from('123');
  const minSharesQuantity = '1';
  let fundDeployer: FundDeployer, policyManager: PolicyManager;
  let fundOwner: SignerWithAddress, buyer: SignerWithAddress, randomCaller: SignerWithAddress;
  let denominationAsset: StandardToken;

  beforeEach(async () => {
    fork = await deployProtocolFixture();

    [fundOwner, buyer, randomCaller] = fork.accounts;

    fundDeployer = fork.deployment.fundDeployer;
    policyManager = fork.deployment.policyManager;

    denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
    await seedAccount({ account: randomCaller, amount: investmentAmount, provider, token: denominationAsset });

    // TODO: set protocol fee to 0 for simplicity/clarity
  });

  // Other validations and assertions are performed in buyShares() tests

  describe('sharesActionTimelock', () => {
    let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;

    beforeEach(async () => {
      const newFundRes = await createNewFund({
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundDeployer,
        sharesActionTimelock: 1,
        signer: fundOwner,
      });

      comptrollerProxy = newFundRes.comptrollerProxy;
      vaultProxy = newFundRes.vaultProxy;

      await denominationAsset.connect(randomCaller).approve(comptrollerProxy, investmentAmount);
    });

    it('cannot be called a random user', async () => {
      await expect(
        comptrollerProxy.connect(randomCaller).buySharesOnBehalf(buyer, investmentAmount, minSharesQuantity),
      ).rejects.toBeRevertedWith('Unauthorized');
    });

    it('happy path', async () => {
      // Approve the randomCaller as an allowed caller
      await fundDeployer.registerBuySharesOnBehalfCallers([randomCaller]);

      const receipt = await comptrollerProxy
        .connect(randomCaller)
        .buySharesOnBehalf(buyer, investmentAmount, minSharesQuantity);

      const expectedGav = investmentAmount;
      const expectedSharesIssued = investmentAmount
        .mul(utils.parseEther('1')) // SHARES UNIT
        .div(await getAssetUnit(denominationAsset));
      const expectedSharesReceived = expectedSharesIssued;

      // Only need to assert shares were received by the buyer, that policies were run with the correct data,
      // and that the event has the correct data. All other assertions are the same as buyShares()

      expect(await vaultProxy.balanceOf(buyer)).toEqBigNumber(expectedSharesReceived);

      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.PostBuyShares,
        validateRulePostBuySharesArgs({
          buyer,
          fundGav: expectedGav,
          investmentAmount,
          sharesIssued: expectedSharesIssued,
        }),
      );

      assertEvent(receipt, 'SharesBought', {
        buyer,
        investmentAmount,
        sharesIssued: expectedSharesIssued,
        sharesReceived: expectedSharesReceived,
      });
    });
  });

  describe('no sharesActionTimelock', () => {
    let comptrollerProxy: ComptrollerLib;

    beforeEach(async () => {
      const newFundRes = await createNewFund({
        denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
        fundDeployer,
        sharesActionTimelock: 0,
        signer: fundOwner, // Not necessary, but explicit
      });

      comptrollerProxy = newFundRes.comptrollerProxy;

      await denominationAsset.connect(randomCaller).approve(comptrollerProxy, investmentAmount);
    });

    it('happy path: allows a random caller', async () => {
      await comptrollerProxy.connect(randomCaller).buySharesOnBehalf(buyer, investmentAmount, minSharesQuantity);
    });
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
        redeemSharesInKind({ comptrollerProxy, quantity: utils.parseEther('0'), signer: investor }),
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
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset,
        fundDeployer,
        investment: {
          buyer: fundManager,
          investmentAmount,
          provider,
        },
        signer: fundManager,
      });

      await buyShares({
        provider,
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
        investmentAmount,
      });

      const redeemQuantity = (await vaultProxy.balanceOf(investor)).add(1);

      await expect(
        redeemSharesInKind({
          comptrollerProxy,
          quantity: redeemQuantity,
          signer: investor,
        }),
      ).rejects.toBeRevertedWith('burn amount exceeds balance');
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
        denominationAsset,
        fundDeployer,
        fundOwner,
        signer: fundOwner,
      });

      await expect(
        redeemSharesForSpecificAssets({
          comptrollerProxy,
          payoutAssetPercentages: [1],
          payoutAssets: [],
          signer: investor,
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
        denominationAsset,
        fundDeployer,
        fundOwner,
        signer: fundOwner,
      });

      await expect(
        redeemSharesForSpecificAssets({
          comptrollerProxy,
          payoutAssetPercentages: [50, 50],
          payoutAssets: [constants.AddressZero, constants.AddressZero],
          signer: investor,
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
        denominationAsset,
        fundDeployer,
        fundOwner,
        investment: {
          buyer: investor,
          provider,
        },
        signer: fundOwner,
      });

      // Send second asset to the fund
      const secondAsset = new StandardToken(mln, provider);
      await seedAccount({ provider, account: vaultProxy, amount: await getAssetUnit(secondAsset), token: secondAsset });

      await expect(
        redeemSharesForSpecificAssets({
          comptrollerProxy,
          payoutAssetPercentages: [10000, 1],
          payoutAssets: [denominationAsset, secondAsset],
          signer: investor,
        }),
      ).rejects.toBeRevertedWith('Percents must total 100%');

      await expect(
        redeemSharesForSpecificAssets({
          comptrollerProxy,
          payoutAssetPercentages: [9999],
          payoutAssets: [denominationAsset],
          signer: investor,
        }),
      ).rejects.toBeRevertedWith('Percents must total 100%');
    });

    it('does not allow a specified asset payout amount of 0', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer },
        accounts: [fundOwner, investor],
        config: {
          primitives: { mln },
        },
      } = await provider.snapshot(snapshot);

      const investorInvestmentAmount = await getAssetUnit(denominationAsset);
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset,
        fundDeployer,
        fundOwner,
        // Buy shares with fundOwner to inflate share pool and decrease investor owed gav
        investment: {
          buyer: fundOwner,
          investmentAmount: investorInvestmentAmount.mul(10),
          provider,
        },

        signer: fundOwner,
      });

      // Buy a relatively small amount of shares for the investor to guarantee they can redeem one wei of shares with no owed value
      await buyShares({
        provider,
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
        investmentAmount: investorInvestmentAmount,
      });

      const zeroBalanceAsset = new StandardToken(mln, provider);

      expect(await zeroBalanceAsset.balanceOf(vaultProxy)).toEqBigNumber(0);

      await expect(
        redeemSharesForSpecificAssets({
          comptrollerProxy,
          payoutAssetPercentages: [10000],
          payoutAssets: [zeroBalanceAsset],
          quantity: 1,
          signer: investor,
        }),
      ).rejects.toBeRevertedWith('Zero amount for asset');
    });

    it('happy path: full shares balance, with no protocol fee', async () => {
      const {
        fund: { denominationAsset },
        deployment: {
          feeManager,
          fundDeployer,
          integrationManager,
          policyManager,
          protocolFeeTracker,
          valueInterpreter,
        },
        accounts: [fundOwner, investor],
        config: {
          primitives: { dai, mln },
        },
      } = await provider.snapshot(snapshot);

      // Turn off the protocol fee
      await protocolFeeTracker.setFeeBpsDefault(0);

      // Create a new fund, invested in by the fund manager and an investor
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset,
        fundDeployer,
        fundOwner,
        investment: {
          buyer: fundOwner,
          provider,
        },
        signer: fundOwner,
      });

      // Buy a relatively small amount of shares for the investor to guarantee they can redeem the specified asset balances
      const investorInvestmentAmount = (await getAssetUnit(denominationAsset)).div(10);

      await buyShares({
        provider,
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
        investmentAmount: investorInvestmentAmount,
      });

      // Define the redemption parameters
      const recipient = randomAddress();
      const payoutAssets = [new StandardToken(mln, provider), new StandardToken(dai, provider)];
      const oneHundredPercent = 10000;
      const payoutAssetPercentages = [3000, 7000]; // 30% and 70%

      // Send and track the redemption assets with the equivalent values as the denomination asset balance
      const preTxVaultDenominationAssetBalance = await denominationAsset.balanceOf(vaultProxy);

      await addNewAssetsToFund({
        provider,
        amounts: await Promise.all(
          payoutAssets.map(async (asset) =>
            valueInterpreter.calcCanonicalAssetValue
              .args(denominationAsset, preTxVaultDenominationAssetBalance, asset)
              .call(),
          ),
        ),
        assets: payoutAssets,
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      // Calculate the expected shares redeemed and gav owed prior to redemption
      const expectedSharesRedeemed = await vaultProxy.balanceOf(investor);
      const preTxGav = await comptrollerProxy.calcGav.call();
      const gavOwed = preTxGav.mul(expectedSharesRedeemed).div(await vaultProxy.totalSupply());

      // Redeem all of the investor's shares
      const receipt = await redeemSharesForSpecificAssets({
        comptrollerProxy,

        payoutAssetPercentages,

        // unnecessary, but explicit
        payoutAssets,
        quantity: constants.MaxUint256,
        recipient,
        signer: investor,
      });

      // Calculate the expected payout amounts
      const expectedPayoutAmounts = await Promise.all(
        payoutAssets.map(async (asset, i) =>
          valueInterpreter.calcCanonicalAssetValue
            .args(denominationAsset, gavOwed.mul(payoutAssetPercentages[i]).div(oneHundredPercent), asset)
            .call(),
        ),
      );

      // Assert that the new GAV is roughly the old gav minus gav owed
      expect(await comptrollerProxy.calcGav.call()).toBeAroundBigNumber(preTxGav.sub(gavOwed));

      // Assert the redeemer has redeemed all shares
      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(0);

      // Assert the recipient has received the expected assets and balances
      for (const i in payoutAssets) {
        expect(await payoutAssets[i].balanceOf(recipient)).toEqBigNumber(expectedPayoutAmounts[i]);
      }

      // Assert the correct event was emitted
      assertEvent(receipt, 'SharesRedeemed', {
        receivedAssetAmounts: expectedPayoutAmounts,
        receivedAssets: payoutAssets,
        recipient,
        redeemer: investor,
        sharesAmount: expectedSharesRedeemed,
      });

      // Assert the Policy Manager was called correctly
      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.RedeemSharesForSpecificAssets,
        validateRuleRedeemSharesForSpecificAssetsArgs({
          assetAmounts: expectedPayoutAmounts,
          assets: payoutAssets,
          gavPreRedeem: preTxGav,
          recipient,
          redeemer: investor,
          sharesToRedeemPostFees: expectedSharesRedeemed,
        }),
      );

      // Assert the FeeManager was called with the correct data
      expect(feeManager.invokeHook).toHaveBeenCalledOnContractWith(
        FeeHook.PreRedeemShares,
        settlePreRedeemSharesArgs({
          forSpecifiedAssets: true,
          redeemer: investor,
          sharesToRedeem: expectedSharesRedeemed,
        }),
        preTxGav,
      );
    });

    it('happy path: derivative asset (no protocol fee)', async () => {
      const {
        deployment: { fundDeployer, integrationManager, protocolFeeTracker, valueInterpreter },
        accounts: [fundOwner, investor],
        config: {
          primitives: { usdc },
          compound: {
            ctokens: { cdai },
          },
        },
      } = await provider.snapshot(snapshot);

      // Turn off the protocol fee
      await protocolFeeTracker.setFeeBpsDefault(0);

      // Create a new fund, invested in by the fund manager and an investor
      const denominationAsset = new StandardToken(usdc, provider);
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset,
        fundDeployer,
        fundOwner,
        investment: {
          buyer: fundOwner,
          provider,
          seedBuyer: true,
        },
        signer: fundOwner,
      });

      await buyShares({
        provider,
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
        seedBuyer: true,
      });

      // Define the redemption parameters
      const recipient = randomAddress();
      const payoutAsset = new StandardToken(cdai, provider);

      // Send and track the redemption asset with the equivalent values as the denomination asset balance,
      // so that redeeming half the shares should result in withdrawing almost all of the payoutAsset
      const preTxVaultDenominationAssetBalance = await denominationAsset.balanceOf(vaultProxy);

      await addNewAssetsToFund({
        provider,
        amounts: [
          await valueInterpreter.calcCanonicalAssetValue
            .args(denominationAsset, preTxVaultDenominationAssetBalance, payoutAsset)
            .call(),
        ],
        assets: [payoutAsset],
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      // Calculate the expected shares redeemed and gav owed prior to redemption
      const expectedSharesRedeemed = (await vaultProxy.balanceOf(investor)).div(2);
      const preTxGav = await comptrollerProxy.calcGav.call();
      const gavOwed = preTxGav.mul(expectedSharesRedeemed).div(await vaultProxy.totalSupply());

      // Redeem all of the investor's shares
      await redeemSharesForSpecificAssets({
        comptrollerProxy,
        payoutAssetPercentages: [ONE_HUNDRED_PERCENT_IN_BPS],
        payoutAssets: [payoutAsset],
        quantity: expectedSharesRedeemed,
        recipient,
        signer: investor,
      });

      // Calculate the expected payout amounts
      const expectedPayoutAmount = await valueInterpreter.calcCanonicalAssetValue
        .args(denominationAsset, gavOwed, payoutAsset)
        .call();

      expect(expectedPayoutAmount).toBeGtBigNumber(0);

      // Assert that the new GAV is roughly the old gav minus gav owed
      // The actual GAV will be slightly lower than the expected GAV, due to rounding during the primitive-to-derivative price conversion
      expect(await comptrollerProxy.calcGav.call()).toBeAroundBigNumber(preTxGav.sub(gavOwed), 100);

      // Assert the recipient has received the expected assets and balances
      expect(await payoutAsset.balanceOf(recipient)).toEqBigNumber(expectedPayoutAmount);
    });

    it('happy path: explicitly claim less than 100% of owed gav', async () => {
      const {
        fund: { denominationAsset },
        deployment: { fundDeployer, valueInterpreter },
        accounts: [fundOwner, investor],
      } = await provider.snapshot(snapshot);

      // Create a new fund, invested in by the fund manager
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset,
        fundDeployer,
        fundOwner,
        investment: {
          buyer: investor,
          provider,
        },
        signer: fundOwner,
      });

      // Define the redemption parameters
      const payoutAssets = [denominationAsset, SPECIFIC_ASSET_REDEMPTION_DUMMY_FORFEIT_ADDRESS];
      const oneHundredPercent = 10000;
      const payoutAssetPercentages = [9000, 1000]; // 90% and 10%

      // Calculate the expected shares redeemed and gav owed prior to redemption
      const expectedSharesRedeemed = (await vaultProxy.balanceOf(investor)).div(4);
      const preTxGav = await comptrollerProxy.calcGav.call();
      const preTxSharesSupply = await vaultProxy.totalSupply();

      // Redeem part of the investor's shares
      const receipt = await redeemSharesForSpecificAssets({
        comptrollerProxy,
        payoutAssetPercentages,
        payoutAssets,
        quantity: expectedSharesRedeemed,
        signer: investor,
      });

      // Calculate gav that should have been paid out to the redeemer. This needs to be done after
      // the redemption has taken place to take into account protocol fees charged
      const sharesSupplyWithProtocolFee = expectedSharesRedeemed.add(await vaultProxy.totalSupply());

      // This also confirms that a protocol fee was charged
      expect(sharesSupplyWithProtocolFee).toBeGtBigNumber(preTxSharesSupply);

      const gavOwed = preTxGav.mul(expectedSharesRedeemed).div(sharesSupplyWithProtocolFee);

      // Calculate the expected payout amount and expect 0 for the empty asset
      const expectedPayoutAmounts = [
        await valueInterpreter.calcCanonicalAssetValue
          .args(denominationAsset, gavOwed.mul(payoutAssetPercentages[0]).div(oneHundredPercent), denominationAsset)
          .call(),
        0,
      ];

      // Assert the correct event was emitted
      assertEvent(receipt, 'SharesRedeemed', {
        receivedAssetAmounts: expectedPayoutAmounts,
        receivedAssets: payoutAssets,
        recipient: investor,
        redeemer: investor,
        sharesAmount: expectedSharesRedeemed,
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
        denominationAsset,
        fundDeployer,
        investment: {
          buyer: fundManager,
          investmentAmount,
          provider,
        },
        signer: fundManager,
      });

      await buyShares({
        provider,
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
        investmentAmount,
      });

      const redeemQuantity = investmentAmount;

      await denominationAsset.makeItReentracyToken(comptrollerProxy);

      await expect(
        redeemSharesInKind({
          comptrollerProxy,
          quantity: redeemQuantity,
          signer: investor,
        }),
      ).rejects.toBeRevertedWith('Re-entrance');
    });

    it('does not allow a _sharesQuantity of 0', async () => {
      const {
        accounts: [investor],
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        redeemSharesInKind({ comptrollerProxy, quantity: utils.parseEther('0'), signer: investor }),
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
          additionalAssets: [weth, weth],
          comptrollerProxy,
          quantity: utils.parseEther('1'),
          signer: investor,
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
          assetsToSkip: [weth, weth],
          comptrollerProxy,
          quantity: utils.parseEther('1'),
          signer: investor,
        }),
      ).rejects.toBeRevertedWith('_assetsToSkip contains duplicates');
    });

    it('happy path: full shares balance, no additional config, no protocol fee', async () => {
      const {
        fund: { denominationAsset },
        deployment: { feeManager, fundDeployer, integrationManager, protocolFeeTracker },
        accounts: [fundOwner, investor],
        config: {
          primitives: { mln },
        },
      } = await provider.snapshot(snapshot);

      // Turn off the protocol fee
      await protocolFeeTracker.setFeeBpsDefault(0);

      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset,
        fundDeployer,
        fundOwner,
        signer: fundOwner,
      });

      await buyShares({
        provider,
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
      });

      await seedAccount({ account: vaultProxy, amount: 1, provider, token: denominationAsset });

      // Send and track a second asset in the vault, but then allow it to be untracked
      const secondAsset = new StandardToken(mln, provider);

      await addNewAssetsToFund({
        provider,
        amounts: [(await getAssetUnit(secondAsset)).mul(3)],
        assets: [secondAsset],
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      // Define the expected payout assets
      const expectedSharesRedeemed = await vaultProxy.balanceOf(investor);
      const expectedPayoutAssets = [denominationAsset, secondAsset];
      const expectedPayoutAmounts = await Promise.all(
        expectedPayoutAssets.map(async (asset) => asset.balanceOf(vaultProxy)),
      );

      // Record the investor's pre-redemption balances
      const preTxInvestorExpectedAssetsBalances = await getAssetBalances({
        account: investor,
        assets: expectedPayoutAssets,
      });

      const preTxGav = await comptrollerProxy.calcGav.call();

      expect(preTxGav).toBeGtBigNumber(0);

      // Redeem all of investor's shares
      const receipt = await redeemSharesInKind({
        comptrollerProxy,
        quantity: constants.MaxUint256,
        signer: investor, // unnecessary, but explicit
      });

      assertEvent(receipt, 'SharesRedeemed', {
        receivedAssetAmounts: expectedPayoutAmounts,
        receivedAssets: expectedPayoutAssets,
        recipient: investor,
        redeemer: investor,
        sharesAmount: expectedSharesRedeemed,
      });

      // Assert the redeemer has redeemed all shares and received the expected assets and full balances
      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(0);

      for (const i in expectedPayoutAssets) {
        expect(await expectedPayoutAssets[i].balanceOf(investor)).toEqBigNumber(
          preTxInvestorExpectedAssetsBalances[i].add(expectedPayoutAmounts[i]),
        );
      }

      // Assert the FeeManager was called with the correct data
      expect(feeManager.invokeHook).toHaveBeenCalledOnContractWith(
        FeeHook.PreRedeemShares,
        settlePreRedeemSharesArgs({
          forSpecifiedAssets: false,
          redeemer: investor,
          sharesToRedeem: expectedSharesRedeemed,
        }),
        0, // Not calculated
      );
    });

    it('happy path: partial shares, one additional asset, one asset to ignore, a different recipient', async () => {
      const {
        fund: { denominationAsset },
        deployment: { feeManager, fundDeployer },
        accounts: [fundManager, investor],
        config: {
          primitives: { mln },
        },
      } = await provider.snapshot(snapshot);

      // Create a new fund, and invested in equally by the fund manager and an investor
      const investmentAmount = await getAssetUnit(denominationAsset);
      const { comptrollerProxy, vaultProxy } = await createNewFund({
        denominationAsset,
        fundDeployer,
        investment: {
          buyer: fundManager,
          investmentAmount,
          provider,
        },
        signer: fundManager,
      });

      await buyShares({
        provider,
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
        investmentAmount,
      });

      // Warp time so that a protocol fee will be due while redeeming
      await provider.send('evm_increaseTime', [3600]);

      // Send untracked asset directly to fund
      const untrackedAsset = new StandardToken(mln, provider);
      const untrackedAssetBalance = utils.parseEther('2');
      await seedAccount({ provider, account: vaultProxy, amount: untrackedAssetBalance, token: untrackedAsset });

      // Assert the asset is not tracked
      const isTrackedAssetCall = await vaultProxy.isTrackedAsset(untrackedAsset);

      expect(isTrackedAssetCall).toBe(false);

      // Define the redemption params and the expected payout assets
      const recipient = randomAddress();
      const investorPreTxShares = await vaultProxy.balanceOf(investor);
      const redeemQuantity = investorPreTxShares.div(2);
      const additionalAssets = [untrackedAsset];
      const assetsToSkip = [denominationAsset];
      const expectedPayoutAsset = untrackedAsset;

      // Record the pre-redemption balances
      const [preTxRecipientExpectedPayoutAssetBalance, preTxReceipientAssetToSkipBalance] = await getAssetBalances({
        account: recipient,
        assets: [expectedPayoutAsset, denominationAsset],
      });
      const preTxVaultExpectedPayoutAssetBalance = await expectedPayoutAsset.balanceOf.args(vaultProxy).call();
      const preTxSharesSupply = await vaultProxy.totalSupply();

      // Redeem half of investor's shares
      const receipt = await redeemSharesInKind({
        additionalAssets,
        assetsToSkip,
        comptrollerProxy,
        quantity: redeemQuantity,
        recipient,
        signer: investor,
      });

      // Calculate expected payout amount to the redeemer. This needs to be done after
      // the redemption has taken place to take into account protocol fees charged.
      const sharesSupplyWithProtocolFee = redeemQuantity.add(await vaultProxy.totalSupply());

      // This also confirms that a protocol fee was charged
      expect(sharesSupplyWithProtocolFee).toBeGtBigNumber(preTxSharesSupply);

      const expectedPayoutAmount = preTxVaultExpectedPayoutAssetBalance
        .mul(redeemQuantity)
        .div(sharesSupplyWithProtocolFee);

      // Assert the event
      assertEvent(receipt, 'SharesRedeemed', {
        receivedAssetAmounts: [expectedPayoutAmount],
        receivedAssets: [expectedPayoutAsset],
        recipient,
        redeemer: investor,
        sharesAmount: redeemQuantity,
      });

      const [postTxRecipientExpectedPayoutAssetBalance, postTxRecipientAssetToSkipBalance] = await getAssetBalances({
        account: recipient,
        assets: [untrackedAsset, denominationAsset],
      });

      // Assert the redeemer has redeemed the correct shares quantity and that the recipient received the expected assets and balances
      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(investorPreTxShares.sub(redeemQuantity));
      expect(postTxRecipientExpectedPayoutAssetBalance).toEqBigNumber(
        preTxRecipientExpectedPayoutAssetBalance.add(expectedPayoutAmount),
      );
      expect(postTxRecipientAssetToSkipBalance).toEqBigNumber(preTxReceipientAssetToSkipBalance);

      // Assert the FeeManager was called with the correct data
      expect(feeManager.invokeHook).toHaveBeenCalledOnContractWith(
        FeeHook.PreRedeemShares,
        settlePreRedeemSharesArgs({
          forSpecifiedAssets: false,
          redeemer: investor,
          sharesToRedeem: redeemQuantity,
        }),
        0, // Not calculated
      );
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
        fees,
        settings: feesSettingsData,
      });

      const investmentAmount = (await getAssetUnit(denominationAsset)).mul(2);
      const { comptrollerProxy } = await createNewFund({
        denominationAsset,
        feeManagerConfig,
        fundDeployer,
        investment: {
          buyer: investor,
          investmentAmount,
          provider,
        },
        signer: fundManager,
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
        failureReturnData: expect.anything(),
        redeemer: investor,
        sharesAmount: investmentAmount,
      });
    });

    it.todo('handles a payProtocolFee failure');
  });
});

describe('transfer shares', () => {
  const transferee = randomAddress();
  const transferAmount = 123;
  let fundOwner: SignerWithAddress, investor: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let sharesActionTimelock: BigNumberish;

  beforeEach(async () => {
    [fundOwner, investor] = fork.accounts;

    // Spin up and invest in a fund to create shares
    sharesActionTimelock = 1000;
    const newFundRes = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      investment: {
        buyer: investor,
        provider,
        seedBuyer: true,
      },
      sharesActionTimelock,
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    // Reset the provider history to correctly assert expected calls
    provider.history.clear();
  });

  describe('preTransferSharesHook', () => {
    it('cannot be directly called by the owner', async () => {
      // Warp ahead of the sharesActionTimelock
      await provider.send('evm_increaseTime', [sharesActionTimelock]);

      await expect(
        comptrollerProxy.connect(fundOwner).preTransferSharesHook(investor, transferee, transferAmount),
      ).rejects.toBeRevertedWith('Only VaultProxy callable');
    });

    it('respects the sharesActionTimelock', async () => {
      await expect(vaultProxy.connect(investor).transfer(transferee, transferAmount)).rejects.toBeRevertedWith(
        'Shares action timelocked',
      );
    });

    it('happy path', async () => {
      // Warp ahead of the sharesActionTimelock
      await provider.send('evm_increaseTime', [sharesActionTimelock]);

      // Execute the transfer
      await vaultProxy.connect(investor).transfer(transferee, transferAmount);

      // Assert the target function was correctly called
      expect(comptrollerProxy.preTransferSharesHook).toHaveBeenCalledOnContractWith(
        investor,
        transferee,
        transferAmount,
      );

      // Assert the PolicyManager was correctly called
      expect(fork.deployment.policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.PreTransferShares,
        encodeArgs(['address', 'address', 'uint256'], [investor, transferee, transferAmount]),
      );
    });
  });

  describe('preTransferSharesHookFreelyTransferable', () => {
    beforeEach(async () => {
      await vaultProxy.setFreelyTransferableShares();
    });

    it('respects the sharesActionTimelock', async () => {
      await expect(vaultProxy.connect(investor).transfer(transferee, transferAmount)).rejects.toBeRevertedWith(
        'Shares action timelocked',
      );
    });

    it('happy path', async () => {
      // Warp ahead of the sharesActionTimelock
      await provider.send('evm_increaseTime', [sharesActionTimelock]);

      // Execute the transfer
      await vaultProxy.connect(investor).transfer(transferee, transferAmount);

      // Assert the target function was correctly called
      expect(comptrollerProxy.preTransferSharesHookFreelyTransferable).toHaveBeenCalledOnContractWith(investor);

      // Assert the PolicyManager was not called
      expect(fork.deployment.policyManager.validatePolicies).not.toHaveBeenCalledOnContract();
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
      denominationAsset,
      fundDeployer,
      signer: fundManager,
    });

    const getSharesActionTimelockCall = await comptrollerProxy.getSharesActionTimelock();

    expect(getSharesActionTimelockCall).toEqBigNumber(0);

    // Buy shares to start the timelock (though the timelock is 0)
    await buyShares({
      provider,
      buyer: investor,
      comptrollerProxy,
      denominationAsset,
    });

    // Assert that relevant shares action timelock state is not updated
    expect(await comptrollerProxy.getLastSharesBoughtTimestampForAccount(investor)).toEqBigNumber(0);

    // Immediately redeeming shares should succeed
    await redeemSharesInKind({
      comptrollerProxy,
      signer: investor,
    });
  });

  it('is respected when redeeming shares (no pending migration or reconfiguration)', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer },
      accounts: [fundManager, investor],
    } = await provider.snapshot(snapshot);

    // Transfer some weth to the investor account.

    // Create a new fund, with a timelock
    const sharesActionTimelock = 100;
    const { comptrollerProxy } = await createNewFund({
      denominationAsset,
      fundDeployer,
      sharesActionTimelock,
      signer: fundManager,
    });

    // Buy shares to start the timelock
    const receipt = await buyShares({
      provider,
      buyer: investor,
      comptrollerProxy,
      denominationAsset,
    });

    // Assert that relevant shares action timelock state is updated
    expect(await comptrollerProxy.getLastSharesBoughtTimestampForAccount(investor)).toEqBigNumber(
      await transactionTimestamp(receipt),
    );

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
      deployment: {
        externalPositionManager,
        dispatcher,
        feeManager,
        fundDeployer,
        gasRelayPaymasterFactory,
        integrationManager,
        policyManager,
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
      denominationAsset,
      fundDeployer,
      fundOwner,
      sharesActionTimelock,
      signer: fundOwner,
    });

    // Buy shares to start the timelock
    await expect(
      buyShares({
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
        provider,
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
      dispatcher,
      externalPositionManager,
      feeManager,
      gasRelayPaymasterFactory,
      integrationManager,
      policyManager,
      valueInterpreter,
      vaultLib,
    });

    // Create fund config on the new FundDeployer to migrate to
    await createMigrationRequest({
      denominationAsset,
      fundDeployer: nextFundDeployer,
      signer: fundOwner,
      vaultProxy,
    });

    // Redeeming shares should succeed now that the fund has a migration pending
    await expect(
      redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
      }),
    ).resolves.toBeReceipt();
  });
});
