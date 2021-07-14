import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib, ProtocolFeeReserveLib, StandardToken, VaultLib } from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  ProtocolDeployment,
  redeemSharesInKind,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('buyBackProtocolFeeShares', () => {
  let protocolFeeReserveProxy: ProtocolFeeReserveLib;
  let fundOwner: SignerWithAddress, remainingAccounts: SignerWithAddress[];
  let denominationAsset: StandardToken, mln: StandardToken;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let feeSharesCollected: BigNumber, grossShareValue: BigNumber;

  beforeEach(async () => {
    [fundOwner, ...remainingAccounts] = fork.accounts;

    protocolFeeReserveProxy = fork.deployment.protocolFeeReserveProxy;

    denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    mln = new StandardToken(fork.config.primitives.mln, whales.mln);

    const newFundRes = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      denominationAsset,
      // Invest the 1st time to give a positive supply of shares and allow accruing protocol fee
      investment: {
        buyer: fundOwner,
        investmentAmount: await getAssetUnit(denominationAsset),
        seedBuyer: true,
      },
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    // Warp time to accrue protocol fee, then pay the protocol fee to issue shares to the ProtocolFeeReserveProxy
    await provider.send('evm_increaseTime', [3600]);

    // Redeem some shares to pay out the protocol fee
    await redeemSharesInKind({
      comptrollerProxy,
      signer: fundOwner,
      quantity: (await vaultProxy.balanceOf(fundOwner)).div(2),
    });

    feeSharesCollected = await vaultProxy.balanceOf(protocolFeeReserveProxy);
    expect(feeSharesCollected).toBeGtBigNumber(0);

    // Seed the fund with more MLN than needed to buyback the target shares
    // 1 MLN : 1 USDC is more than enough
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      assets: [mln],
      amounts: [await getAssetUnit(mln)],
    });

    grossShareValue = await comptrollerProxy.calcGrossShareValue.args(true).call();
  });

  it('cannot be called by a random user', async () => {
    const [randomUser] = remainingAccounts;

    await expect(
      comptrollerProxy.connect(randomUser).buyBackProtocolFeeShares(feeSharesCollected),
    ).rejects.toBeRevertedWith('Only fund owner callable');
  });

  it('happy path: buyback all shares collected', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    const sharesToBuyBack = feeSharesCollected;

    const preTxVaultMlnBalance = await mln.balanceOf(vaultProxy);

    await comptrollerProxy.connect(fundOwner).buyBackProtocolFeeShares(sharesToBuyBack);

    // Calculate mlnValue of shares to buyback
    const denominationAssetValueOfBuyback = grossShareValue.mul(sharesToBuyBack).div(utils.parseEther('1'));
    const mlnValueOfBuyback = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, denominationAssetValueOfBuyback, mln)
      .call();

    // Assert that the correct amount of MLN was burned
    // Buyback discount is 50%; use same formula as contract
    const mlnAmountToBurn = mlnValueOfBuyback.mul(5000).div(10000);
    expect(await mln.balanceOf(vaultProxy)).toEqBigNumber(preTxVaultMlnBalance.sub(mlnAmountToBurn));

    // Assert that all shares of the ProtocolFeeReserveProxy were burned
    expect(await vaultProxy.balanceOf(protocolFeeReserveProxy)).toEqBigNumber(0);
  });

  it('happy path: buyback partial shares collected', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    const sharesToBuyBack = feeSharesCollected.div(4);

    const preTxVaultMlnBalance = await mln.balanceOf(vaultProxy);

    await comptrollerProxy.connect(fundOwner).buyBackProtocolFeeShares(sharesToBuyBack);

    // Calculate mlnValue of shares to buyback
    const denominationAssetValueOfBuyback = grossShareValue.mul(sharesToBuyBack).div(utils.parseEther('1'));
    const mlnValueOfBuyback = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, denominationAssetValueOfBuyback, mln)
      .call();

    // Assert that the correct amount of MLN was burned
    // Buyback discount is 50%; use same formula as contract
    const mlnAmountToBurn = mlnValueOfBuyback.mul(5000).div(10000);
    expect(await mln.balanceOf(vaultProxy)).toEqBigNumber(preTxVaultMlnBalance.sub(mlnAmountToBurn));

    // Assert that the correct number of shares of the ProtocolFeeReserveProxy were burned
    expect(await vaultProxy.balanceOf(protocolFeeReserveProxy)).toEqBigNumber(feeSharesCollected.sub(sharesToBuyBack));
  });
});
