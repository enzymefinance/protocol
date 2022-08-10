import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import {
  ITestStandardToken,
  OlympusV2Adapter,
  olympusV2StakeArgs,
  olympusV2UnstakeArgs,
  SpendAssetsHandleType,
  stakeSelector,
  unstakeSelector,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  olympusV2Stake,
  olympusV2Unstake,
  setAccountBalance,
} from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

let olympusV2Adapter: OlympusV2Adapter;
let ohm: AddressLike;
let sohm: AddressLike;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  olympusV2Adapter = new OlympusV2Adapter(fork.deployment.olympusV2Adapter, provider);

  ohm = await olympusV2Adapter.getOhmToken();
  sohm = await olympusV2Adapter.getSohmToken();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const stakingContract = await olympusV2Adapter.getOlympusV2StakingContract();

    expect(ohm).toMatchAddress(fork.config.primitives.ohm);
    expect(sohm).toMatchAddress(fork.config.primitives.sohm);
    expect(stakingContract).toMatchAddress(fork.config.olympusV2.stakingContract);
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const amount = utils.parseUnits('1', 18);

    const args = olympusV2StakeArgs({
      amount,
    });

    await expect(
      olympusV2Adapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(olympusV2Adapter.parseAssetsForAction(randomAddress(), stakeSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for staking', async () => {
    // Arbitrary value for testing
    const amount = utils.parseUnits('1', 18);

    const args = olympusV2StakeArgs({
      amount,
    });

    const result = await olympusV2Adapter.parseAssetsForAction(randomAddress(), stakeSelector, args);

    expect(result).toMatchFunctionOutput(olympusV2Adapter.parseAssetsForAction, {
      incomingAssets_: [fork.config.primitives.sohm],
      minIncomingAssetAmounts_: [amount],
      spendAssetAmounts_: [amount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [fork.config.primitives.ohm],
    });
  });

  it('generates expected output for redeeming', async () => {
    // Arbitrary value for testing
    const amount = utils.parseUnits('1', 18);

    const args = olympusV2UnstakeArgs({
      amount,
    });

    const result = await olympusV2Adapter.parseAssetsForAction(randomAddress(), unstakeSelector, args);

    expect(result).toMatchFunctionOutput(olympusV2Adapter.parseAssetsForAction, {
      incomingAssets_: [fork.config.primitives.ohm],
      minIncomingAssetAmounts_: [amount],
      spendAssetAmounts_: [amount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [fork.config.primitives.sohm],
    });
  });
});

describe('stake', () => {
  it('works as expected when called for staking by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const token = new ITestStandardToken(fork.config.primitives.ohm, provider);
    const stakedToken = new ITestStandardToken(fork.config.primitives.sohm, provider);
    const amount = await getAssetUnit(token);

    await setAccountBalance({ provider, account: vaultProxy, amount, token });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [stakedToken, token],
    });

    const stakeReceipt = await olympusV2Stake({
      amount,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      olympusV2Adapter: fork.deployment.olympusV2Adapter,
      signer: fundOwner,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [stakedToken, token],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(amount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(amount));

    expect(stakeReceipt).toMatchInlineGasSnapshot(`236006`);
  });
});

describe('unstake', () => {
  it('works as expected (partial amount)', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const token = new ITestStandardToken(fork.config.primitives.ohm, provider);
    const stakedToken = new ITestStandardToken(fork.config.primitives.sohm, provider);
    const amount = await getAssetUnit(token);

    await setAccountBalance({ provider, account: vaultProxy, amount, token });

    // Stake token to obtain stakedToken
    await olympusV2Stake({
      amount,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      olympusV2Adapter: fork.deployment.olympusV2Adapter,
      signer: fundOwner,
    });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, stakedToken],
    });

    const unstakeReceipt = await olympusV2Unstake({
      amount,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      olympusV2Adapter: fork.deployment.olympusV2Adapter,
      signer: fundOwner,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, stakedToken],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(amount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(amount));

    expect(unstakeReceipt).toMatchInlineGasSnapshot(`236105`);
  });

  it('works as expected (max amount)', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const token = new ITestStandardToken(fork.config.primitives.ohm, provider);
    const stakedToken = new ITestStandardToken(fork.config.primitives.sohm, provider);
    const amount = await getAssetUnit(token);

    await setAccountBalance({ provider, account: vaultProxy, amount, token });

    // Stake token to obtain stakedToken
    await olympusV2Stake({
      amount,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      olympusV2Adapter: fork.deployment.olympusV2Adapter,
      signer: fundOwner,
    });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, stakedToken],
    });

    const unstakeReceipt = await olympusV2Unstake({
      amount: constants.MaxUint256,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      olympusV2Adapter: fork.deployment.olympusV2Adapter,
      signer: fundOwner,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, stakedToken],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(amount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(amount));

    expect(unstakeReceipt).toMatchInlineGasSnapshot(`239300`);
  });
});
