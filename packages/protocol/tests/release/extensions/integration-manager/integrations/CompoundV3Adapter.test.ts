import { randomAddress } from '@enzymefinance/ethers';
import type {
  CompoundV3Adapter,
  ComptrollerLib,
  ITestAddOnlyAddressListOwner,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  claimRewardsSelector,
  compoundV3ClaimRewardsArgs,
  compoundV3LendArgs,
  compoundV3RedeemArgs,
  ITestCompoundV3Comet,
  ITestCompoundV3CometRewards,
  ITestStandardToken,
  lendSelector,
  ONE_YEAR_IN_SECONDS,
  redeemSelector,
  SpendAssetsHandleType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  compoundV3Claim,
  compoundV3Lend,
  compoundV3Redeem,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  impersonateContractSigner,
  setAccountBalance,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

const roundingBuffer = BigNumber.from(2);

let compoundAdapter: CompoundV3Adapter;
let compoundRewards: ITestCompoundV3CometRewards;
let comptrollerProxy: ComptrollerLib;
let cToken: ITestCompoundV3Comet;
let cTokenListOwner: ITestAddOnlyAddressListOwner;
let cTokenUnit: BigNumber;
let underlyingAsset: ITestStandardToken;
let underlyingAssetUnit: BigNumber;
let fork: ProtocolDeployment;
let fundOwner: SignerWithAddress;
let vaultProxy: VaultLib;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;
  compoundAdapter = fork.deployment.compoundV3Adapter;
  compoundRewards = new ITestCompoundV3CometRewards(fork.config.compoundV3.rewards, provider);
  cTokenListOwner = fork.deployment.compoundV3CTokenListOwner;
  cToken = new ITestCompoundV3Comet(fork.config.compoundV3.ctokens.cusdc, provider);
  cTokenUnit = utils.parseUnits('1', await cToken.decimals());
  underlyingAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);
  underlyingAssetUnit = await getAssetUnit(underlyingAsset);
  const newFund = await createNewFund({
    denominationAsset: new ITestStandardToken(underlyingAsset, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });
  comptrollerProxy = newFund.comptrollerProxy;
  vaultProxy = newFund.vaultProxy;

  // Seed vault with cToken and underlying
  await setAccountBalance({ account: vaultProxy, amount: cTokenUnit.mul(100), provider, token: cToken });
  await setAccountBalance({
    account: vaultProxy,
    amount: underlyingAssetUnit.mul(100),
    provider,
    token: underlyingAsset,
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const args = compoundV3LendArgs({
      cToken,
      outgoingAssetAmount: underlyingAssetUnit,
    });

    await expect(
      compoundAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  it('happy path: lend', async () => {
    const spendAmount = underlyingAssetUnit;
    const args = compoundV3LendArgs({
      cToken,
      outgoingAssetAmount: spendAmount,
    });
    const selector = lendSelector;

    const result = await compoundAdapter.parseAssetsForAction(randomAddress(), selector, args);

    expect(result).toMatchFunctionOutput(compoundAdapter.parseAssetsForAction, {
      incomingAssets_: [cToken],
      minIncomingAssetAmounts_: [spendAmount.sub(roundingBuffer)],
      spendAssetAmounts_: [spendAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [underlyingAsset],
    });
  });

  it('happy path: redeem', async () => {
    const spendAmount = cTokenUnit;
    const args = compoundV3RedeemArgs({
      cToken,
      outgoingAssetAmount: spendAmount,
    });
    const selector = redeemSelector;

    const result = await compoundAdapter.parseAssetsForAction(randomAddress(), selector, args);

    expect(result).toMatchFunctionOutput(compoundAdapter.parseAssetsForAction, {
      incomingAssets_: [underlyingAsset],
      minIncomingAssetAmounts_: [spendAmount.sub(roundingBuffer)],
      spendAssetAmounts_: [spendAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [cToken],
    });
  });

  it('happy path: claim rewards', async () => {
    const args = compoundV3ClaimRewardsArgs({
      cTokens: [cToken],
    });
    const selector = claimRewardsSelector;

    const result = await compoundAdapter.parseAssetsForAction(randomAddress(), selector, args);

    expect(result).toMatchFunctionOutput(compoundAdapter.parseAssetsForAction, {
      incomingAssets_: [],
      minIncomingAssetAmounts_: [],
      spendAssetAmounts_: [],
      spendAssetsHandleType_: SpendAssetsHandleType.None,
      spendAssets_: [],
    });
  });
});

describe('lend', () => {
  let outgoingAmount: BigNumber;

  beforeEach(async () => {
    outgoingAmount = (await underlyingAsset.balanceOf(vaultProxy)).div(2);
  });

  it('happy path (unregistered cToken)', async () => {
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [cToken, underlyingAsset],
    });

    const lendReceipt = await compoundV3Lend({
      cToken,
      compoundAdapter,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      tokenAmount: outgoingAmount,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [cToken, underlyingAsset],
    });

    expect(postTxIncomingAssetBalance).toBeAroundBigNumber(
      preTxIncomingAssetBalance.add(outgoingAmount),
      roundingBuffer,
    );
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAmount));

    expect(lendReceipt).toMatchInlineGasSnapshot(`440244`);
  });

  it('happy path (registered cToken)', async () => {
    // Register the cToken on the relevant list
    await cTokenListOwner.addValidatedItemsToList([cToken]);

    const lendReceipt = await compoundV3Lend({
      cToken,
      compoundAdapter,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      tokenAmount: outgoingAmount,
    });

    expect(lendReceipt).toMatchInlineGasSnapshot(`384566`);
  });
});

describe('redeem', () => {
  let outgoingAmount: BigNumber;

  beforeEach(async () => {
    outgoingAmount = (await cToken.balanceOf(vaultProxy)).div(2);
  });

  it('happy path: partial redemption (unregistered cToken)', async () => {
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [underlyingAsset, cToken],
    });

    const redeemReceipt = await compoundV3Redeem({
      cToken,
      cTokenAmount: outgoingAmount,
      compoundAdapter,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [underlyingAsset, cToken],
    });

    expect(postTxIncomingAssetBalance).toBeAroundBigNumber(
      preTxIncomingAssetBalance.add(outgoingAmount),
      roundingBuffer,
    );
    expect(postTxOutgoingAssetBalance).toBeAroundBigNumber(
      preTxOutgoingAssetBalance.sub(outgoingAmount),
      roundingBuffer,
    );

    expect(redeemReceipt).toMatchInlineGasSnapshot(`367950`);
  });

  it('happy path: partial redemption (registered cToken)', async () => {
    // Register the cToken on the relevant list
    await cTokenListOwner.addValidatedItemsToList([cToken]);

    const redeemReceipt = await compoundV3Redeem({
      cToken,
      cTokenAmount: outgoingAmount,
      compoundAdapter,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    expect(redeemReceipt).toMatchInlineGasSnapshot(`312272`);
  });

  it('happy path: max redemption', async () => {
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [underlyingAsset, cToken],
    });

    const redeemReceipt = await compoundV3Redeem({
      cToken,
      cTokenAmount: constants.MaxUint256,
      compoundAdapter,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [underlyingAsset, cToken],
    });

    expect(postTxIncomingAssetBalance).toBeAroundBigNumber(
      preTxIncomingAssetBalance.add(preTxOutgoingAssetBalance),
      roundingBuffer,
    );
    expect(postTxOutgoingAssetBalance).toEqBigNumber(0);

    expect(redeemReceipt).toMatchInlineGasSnapshot(`368453`);
  });
});

describe('claimRewards', () => {
  it('happy path', async () => {
    // Currently, rewards only accrue for borrowers, not lenders (this could change or be different for other cTokens)
    // Therefore, to test rewards claiming, we provide collateral and take out a loan.
    const rewardsToken = new ITestStandardToken((await compoundRewards.rewardConfig(cToken)).token, provider);

    const vaultSigner = await impersonateContractSigner({
      contractAddress: vaultProxy.address,
      ethSeeder: fork.deployer,
      provider,
    });

    // Provide collateral to allow borrowing
    const collateralToken = new ITestStandardToken(fork.config.primitives.uni, provider);
    const collateralUnit = await getAssetUnit(collateralToken);

    await setAccountBalance({
      account: vaultProxy,
      amount: collateralUnit.mul(100_000),
      provider,
      token: collateralToken,
    });
    await collateralToken.connect(vaultSigner).approve(cToken, collateralUnit.mul(100_000));
    await cToken.connect(vaultSigner).supply(collateralToken, collateralUnit.mul(100_000));

    // Take out a loan so that the vault can accrue rewards
    await cToken.connect(vaultSigner).withdraw(underlyingAsset, underlyingAssetUnit.mul(10_000));

    await provider.send('evm_increaseTime', [ONE_YEAR_IN_SECONDS]);
    await provider.send('evm_mine', []);

    const claimReceipt = await compoundV3Claim({
      cTokens: [cToken],
      compoundAdapter,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    const rewardsVaultBalance = await rewardsToken.balanceOf(vaultProxy);
    const rewardsAdapterBalance = await rewardsToken.balanceOf(compoundAdapter);

    expect(rewardsVaultBalance).toBeGtBigNumber(0);
    expect(rewardsAdapterBalance).toEqBigNumber(0);

    expect(claimReceipt).toMatchInlineGasSnapshot(`197601`);
  });
});
