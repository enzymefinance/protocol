/*
 * @file Only tests the EntranceRateBurnFee functionality not covered by
 * the EntranceRateFeeBase tests, i.e., the use of settlement type
 */

import { randomAddress } from '@enzymefinance/ethers';
import {
  EntranceRateBurnFee,
  FeeHook,
  FeeSettlementType,
  entranceRateFeeConfigArgs,
  entranceRateFeeSharesDue,
  settlePostBuySharesArgs,
  feeManagerConfigArgs,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  buyShares,
  createFundDeployer,
  createMigratedFundConfig,
  createNewFund,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [EOAFeeManager, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  // Create standalone EntranceRateBurnFee
  const standaloneEntranceRateFee = await EntranceRateBurnFee.deploy(deployer, EOAFeeManager);
  const denominationAsset = new WETH(config.weth, whales.weth);

  return {
    deployer,
    denominationAsset,
    accounts: remainingAccounts,
    config,
    deployment,
    EOAFeeManager,
    standaloneEntranceRateFee,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { entranceRateBurnFee },
    } = await provider.snapshot(snapshot);

    const getSettlementTypeCall = await entranceRateBurnFee.getSettlementType();
    expect(getSettlementTypeCall).toBe(FeeSettlementType.Burn);
  });
});

describe('settle', () => {
  it('correctly handles valid call', async () => {
    const { EOAFeeManager, standaloneEntranceRateFee } = await provider.snapshot(snapshot);

    // Add fee settings for a random ComptrollerProxy address
    const comptrollerProxyAddress = randomAddress();
    const rate = utils.parseEther('.1'); // 10%
    const entranceRateFeeConfig = await entranceRateFeeConfigArgs(rate);
    await standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .addFundSettings(comptrollerProxyAddress, entranceRateFeeConfig);

    // Create settlementData
    const buyer = randomAddress();
    const sharesBought = utils.parseEther('2');
    const investmentAmount = utils.parseEther('2');
    const settlementData = await settlePostBuySharesArgs({
      buyer,
      sharesBought,
      investmentAmount,
    });

    // Get the expected shares due for the settlement
    const expectedSharesDueForCall = entranceRateFeeSharesDue({
      rate: rate,
      sharesBought,
    });

    // Check the return values via a call() to settle()
    const settleCall = await standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .settle.args(comptrollerProxyAddress, randomAddress(), FeeHook.PostBuyShares, settlementData, 0)
      .call();

    expect(settleCall).toMatchFunctionOutput(standaloneEntranceRateFee.settle, {
      settlementType_: FeeSettlementType.Burn,
      payer_: buyer,
      sharesDue_: expectedSharesDueForCall,
    });

    // Send the tx to actually settle()
    const receipt = await standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .settle(comptrollerProxyAddress, randomAddress(), FeeHook.PostBuyShares, settlementData, 0);

    // Assert the event was emitted
    assertEvent(receipt, 'Settled', {
      comptrollerProxy: comptrollerProxyAddress,
      payer: buyer,
      sharesQuantity: BigNumber.from(expectedSharesDueForCall),
    });
  });
});

describe('integration', () => {
  it('can create a new fund with this fee, works correctly while buying shares', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner, fundInvestor],
      deployment: { fundDeployer, entranceRateBurnFee },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    // Setting up the fund with EntranceRateBurnFee
    const rate = utils.parseEther('0.1'); // 10%
    const entranceRateFeeSettings = entranceRateFeeConfigArgs(rate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [entranceRateBurnFee],
      settings: [entranceRateFeeSettings],
    });

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    // Buying shares of the fund
    await buyShares({
      comptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('0.1')],
    });

    // Check the number of shares we have (check that fee has been paid)
    const rateDivisor = utils.parseEther('1');
    const expectedFee = utils.parseEther('1').mul(rate).div(rateDivisor.add(rate));
    const expectedShares = utils.parseEther('1').sub(expectedFee);
    const investorBalance = await vaultProxy.balanceOf(fundInvestor);
    expect(investorBalance).toEqBigNumber(expectedShares);

    // Check that the fee has been burned (total supply = shares bought - fee)
    const totalSupply = await vaultProxy.totalSupply();
    expect(totalSupply).toEqBigNumber(expectedShares);
  });

  it('can migrate a fund with this fee', async () => {
    const {
      accounts: [fundOwner, fundInvestor],
      deployer,
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      denominationAsset,
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        entranceRateBurnFee,
        feeManager,
        fundDeployer,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const rate = utils.parseEther('0.1'); // 10%
    const entranceRateFeeSettings = entranceRateFeeConfigArgs(rate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [entranceRateBurnFee],
      settings: [entranceRateFeeSettings],
    });

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
      feeManagerConfigData,
    });

    const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
    await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    await signedNextFundDeployer.executeMigration(vaultProxy);

    await buyShares({
      comptrollerProxy: nextComptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('0.1')],
    });

    // Check the number of shares the user has (check that fee has been paid)
    const rateDivisor = utils.parseEther('1');
    const expectedFee = utils.parseEther('1').mul(rate).div(rateDivisor.add(rate));
    const expectedShares = utils.parseEther('1').sub(expectedFee);
    const signerBalance = await vaultProxy.balanceOf(fundInvestor);
    expect(signerBalance).toEqBigNumber(expectedShares);

    // Check that the fee has been burned (total supply === shares bought - fee)
    const totalSupply = await vaultProxy.totalSupply();
    expect(totalSupply).toEqBigNumber(expectedShares);
  });

  it('can add this fee to a fund on migration', async () => {
    const {
      accounts: [fundOwner, fundInvestor],
      deployer,
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      denominationAsset,
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        entranceRateBurnFee,
        feeManager,
        fundDeployer,
        integrationManager,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const rate = utils.parseEther('0.1'); // 10%
    const entranceRateFeeSettings = entranceRateFeeConfigArgs(rate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [entranceRateBurnFee],
      settings: [entranceRateFeeSettings],
    });

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
      feeManagerConfigData,
    });

    const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
    await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    await signedNextFundDeployer.executeMigration(vaultProxy);

    await buyShares({
      comptrollerProxy: nextComptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('0.1')],
    });

    // Check the number of shares the user has (check that fee has been paid)
    const rateDivisor = utils.parseEther('1');
    const expectedFee = utils.parseEther('1').mul(rate).div(rateDivisor.add(rate));
    const expectedShares = utils.parseEther('1').sub(expectedFee);
    const signerBalance = await vaultProxy.balanceOf(fundInvestor);
    expect(signerBalance).toEqBigNumber(expectedShares);

    // Check that the fee has been burned (total supply === shares bought - fee)
    const totalSupply = await vaultProxy.totalSupply();
    expect(totalSupply).toEqBigNumber(expectedShares);
  });
});
