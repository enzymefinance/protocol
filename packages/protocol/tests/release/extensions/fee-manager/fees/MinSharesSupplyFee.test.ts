import type { ComptrollerLib, MinSharesSupplyFee, VaultLib } from '@enzymefinance/protocol';
import {
  FeeHook,
  feeManagerConfigArgs,
  ITestStandardToken,
  NULL_ADDRESS_ALT,
  SHARES_UNIT,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertNoEvent,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
} from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';
import { utils } from 'ethers';

const revertTxGas = 10000000;
const minSharesSupply = utils.parseUnits('1', 6);

let minSharesSupplyFee: MinSharesSupplyFee;
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let denominationAsset: ITestStandardToken;
let fundOwner: SignerWithAddress;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  minSharesSupplyFee = fork.deployment.minSharesSupplyFee;

  [fundOwner] = fork.accounts;
  // We use WETH for the denominationAsset here to make it is possible to buy
  // a shares quantity less than the min shares supply
  denominationAsset = new ITestStandardToken(fork.config.weth, provider);

  const newFundRes = await createNewFund({
    denominationAsset,
    feeManagerConfig: feeManagerConfigArgs({
      fees: [minSharesSupplyFee],
      settings: ['0x'],
    }),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;
});

it('has correct config', async () => {
  for (const hook of Object.values(FeeHook)) {
    expect(await minSharesSupplyFee.settlesOnHook(hook)).toMatchFunctionOutput(minSharesSupplyFee.settlesOnHook, {
      settles_: hook === FeeHook.PostBuyShares,
      usesGav_: false,
    });

    expect(await minSharesSupplyFee.updatesOnHook(hook)).toMatchFunctionOutput(minSharesSupplyFee.updatesOnHook, {
      updates_: false,
      usesGav_: false,
    });
  }
});

describe('settle', () => {
  let buyer: SignerWithAddress;
  let denominationAssetUnit: BigNumber;

  beforeEach(async () => {
    buyer = fundOwner;

    denominationAssetUnit = await getAssetUnit(denominationAsset);
  });

  it('does not allow a non-FeeManager caller', async () => {
    await expect(
      minSharesSupplyFee.settle.args(comptrollerProxy, vaultProxy, 0, '0x', 0).gas(revertTxGas).send(),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('happy path: shares supply === 0', async () => {
    const investmentAmount = denominationAssetUnit;

    const receipt = await buyShares({
      provider,
      comptrollerProxy,
      denominationAsset,
      buyer: fundOwner,
      investmentAmount,
      seedBuyer: true,
    });

    const expectedSharesIssued = investmentAmount.mul(SHARES_UNIT).div(denominationAssetUnit);
    expect(await vaultProxy.totalSupply()).toEqBigNumber(expectedSharesIssued);

    // Fee should have been transferred to lock address
    expect(await vaultProxy.balanceOf(NULL_ADDRESS_ALT)).toEqBigNumber(minSharesSupply);

    // Buyer should have received the expected shares issued net the fee
    expect(await vaultProxy.balanceOf(buyer)).toEqBigNumber(expectedSharesIssued.sub(minSharesSupply));

    assertEvent(receipt, minSharesSupplyFee.abi.getEvent('Settled'), {
      comptrollerProxy,
      payer: buyer,
      sharesQuantity: minSharesSupply,
    });
  });

  it('happy path: locked shares === min shares supply', async () => {
    const investmentAmount = denominationAssetUnit;

    // Invest a first time
    await buyShares({
      provider,
      comptrollerProxy,
      denominationAsset,
      buyer: fundOwner,
      investmentAmount,
      seedBuyer: true,
    });

    const preSecondTxLockedShares = await vaultProxy.balanceOf(NULL_ADDRESS_ALT);

    // Invest a second time
    const secondBuySharesReceipt = await buyShares({
      provider,
      comptrollerProxy,
      denominationAsset,
      buyer: fundOwner,
      investmentAmount,
      seedBuyer: true,
    });

    // Assert that no fee was charged for the second investment
    expect(await vaultProxy.balanceOf(NULL_ADDRESS_ALT)).toEqBigNumber(preSecondTxLockedShares);

    assertNoEvent(secondBuySharesReceipt, minSharesSupplyFee.abi.getEvent('Settled'));
  });

  // Need to do a reconfiguration from a fund not using this policy to make this work
  it.todo('happy path: min shares supply > locked shares > 0');
});
