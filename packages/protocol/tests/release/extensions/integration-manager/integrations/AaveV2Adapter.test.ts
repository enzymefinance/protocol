import { randomAddress } from '@enzymefinance/ethers';
import {
  AaveV2Adapter,
  aaveV2LendArgs,
  aaveV2RedeemArgs,
  ITestStandardToken,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  aaveV2Lend,
  aaveV2Redeem,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  setAccountBalance,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const roundingBuffer = BigNumber.from(2);
let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const aaveV2Adapter = new AaveV2Adapter(fork.deployment.aaveV2Adapter, provider);
    const outgoingToken = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const amount = utils.parseUnits('1', await outgoingToken.decimals());
    const aToken = new ITestStandardToken(fork.config.aaveV2.atokens.ausdc, provider);

    const args = aaveV2LendArgs({
      aToken,
      amount,
    });

    await expect(
      aaveV2Adapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(aaveV2Adapter.parseAssetsForAction(randomAddress(), lendSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const aaveV2Adapter = new AaveV2Adapter(fork.deployment.aaveV2Adapter, provider);
    const outgoingToken = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const amount = utils.parseUnits('1', await outgoingToken.decimals());
    const aToken = new ITestStandardToken(fork.config.aaveV2.atokens.ausdc, provider);

    const args = aaveV2LendArgs({
      aToken,
      amount,
    });

    await expect(
      aaveV2Adapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    const result = await aaveV2Adapter.parseAssetsForAction(randomAddress(), lendSelector, args);

    expect(result).toMatchFunctionOutput(aaveV2Adapter.parseAssetsForAction, {
      incomingAssets_: [aToken.address],
      minIncomingAssetAmounts_: [amount.sub(roundingBuffer)],
      spendAssetAmounts_: [amount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingToken],
    });
  });

  it('generates expected output for redeeming', async () => {
    const aaveV2Adapter = new AaveV2Adapter(fork.deployment.aaveV2Adapter, provider);
    const aToken = new ITestStandardToken(fork.config.aaveV2.atokens.ausdc, provider);
    const amount = utils.parseUnits('1', await aToken.decimals());
    const token = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const args = aaveV2RedeemArgs({
      aToken,
      amount,
    });

    const result = await aaveV2Adapter.parseAssetsForAction(randomAddress(), redeemSelector, args);

    expect(result).toMatchFunctionOutput(aaveV2Adapter.parseAssetsForAction, {
      incomingAssets_: [token],
      minIncomingAssetAmounts_: [amount.sub(roundingBuffer)],
      spendAssetAmounts_: [amount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [aToken],
    });
  });
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const token = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const amount = await getAssetUnit(token);
    const aToken = new ITestStandardToken(fork.config.aaveV2.atokens.ausdc, provider);

    await setAccountBalance({ account: vaultProxy, amount, provider, token });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [aToken, token],
    });

    const lendReceipt = await aaveV2Lend({
      aToken,
      aaveV2Adapter: fork.deployment.aaveV2Adapter,
      amount,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [aToken, token],
    });

    expect(postTxIncomingAssetBalance).toBeAroundBigNumber(preTxIncomingAssetBalance.add(amount), roundingBuffer);
    expect(postTxOutgoingAssetBalance).toBeAroundBigNumber(preTxOutgoingAssetBalance.sub(amount), roundingBuffer);

    expect(lendReceipt).toMatchInlineGasSnapshot(`475982`);
  });
});

describe('redeem', () => {
  it('works as expected when called for redeem by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const aToken = new ITestStandardToken(fork.config.aaveV2.atokens.ausdc, provider);
    const amount = await getAssetUnit(aToken);
    const token = new ITestStandardToken(fork.config.primitives.usdc, provider);

    await setAccountBalance({ account: vaultProxy, amount, provider, token: aToken });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, aToken],
    });

    const redeemReceipt = await aaveV2Redeem({
      aToken,
      aaveV2Adapter: fork.deployment.aaveV2Adapter,
      amount,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, aToken],
    });

    expect(postTxIncomingAssetBalance).toBeAroundBigNumber(preTxIncomingAssetBalance.add(amount), roundingBuffer);
    expect(postTxOutgoingAssetBalance).toBeAroundBigNumber(preTxOutgoingAssetBalance.sub(amount), roundingBuffer);

    // This can vary substantially for whatever reason
    expect(redeemReceipt).toMatchInlineGasSnapshot(`500806`);
  });
});
