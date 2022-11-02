import { randomAddress } from '@enzymefinance/ethers';
import type { AaveV2ATokenListOwner, ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  AaveV2Adapter,
  aaveV2LendArgs,
  aaveV2RedeemArgs,
  ITestStandardToken,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
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

describe('actions', () => {
  let aaveV2ATokenListOwner: AaveV2ATokenListOwner;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let fundOwner: SignerWithAddress;
  let aToken: ITestStandardToken, underlying: ITestStandardToken;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;

    aaveV2ATokenListOwner = fork.deployment.aaveV2ATokenListOwner;

    const newFundRes = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    aToken = new ITestStandardToken(fork.config.aaveV2.atokens.ausdc, provider);
    underlying = new ITestStandardToken(fork.config.primitives.usdc, provider);

    // Seed the vault with the underlying asset
    const seedAmount = (await getAssetUnit(underlying)).mul(10);
    await setAccountBalance({ account: vaultProxy, amount: seedAmount, provider, token: underlying });
  });

  describe('lend', () => {
    let amount: BigNumber;

    beforeEach(async () => {
      amount = (await underlying.balanceOf(vaultProxy)).div(3);
    });

    it('happy path: unregistered aToken', async () => {
      const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [aToken, underlying],
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
        assets: [aToken, underlying],
      });

      expect(postTxIncomingAssetBalance).toBeAroundBigNumber(preTxIncomingAssetBalance.add(amount), roundingBuffer);
      expect(postTxOutgoingAssetBalance).toBeAroundBigNumber(preTxOutgoingAssetBalance.sub(amount), roundingBuffer);

      expect(lendReceipt).toMatchInlineGasSnapshot(`532470`);
    });

    it('happy path: registered aToken', async () => {
      // Register the aToken on the relevant list
      await aaveV2ATokenListOwner.addValidatedItemsToList([aToken]);

      const receipt = await aaveV2Lend({
        aToken,
        aaveV2Adapter: fork.deployment.aaveV2Adapter,
        amount,
        comptrollerProxy,
        fundOwner,
        integrationManager: fork.deployment.integrationManager,
      });

      expect(receipt).toMatchInlineGasSnapshot(`489033`);
    });
  });

  describe('redeem', () => {
    let amount: BigNumber;

    beforeEach(async () => {
      // Seed the vault with the aToken
      const seedAmount = (await getAssetUnit(aToken)).mul(10);
      await setAccountBalance({ account: vaultProxy, amount: seedAmount, provider, token: aToken });

      amount = seedAmount.div(3);
    });

    it('happy path: unregistered aToken', async () => {
      const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [underlying, aToken],
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
        assets: [underlying, aToken],
      });

      expect(postTxIncomingAssetBalance).toBeAroundBigNumber(preTxIncomingAssetBalance.add(amount), roundingBuffer);
      expect(postTxOutgoingAssetBalance).toBeAroundBigNumber(preTxOutgoingAssetBalance.sub(amount), roundingBuffer);

      // This can vary substantially for whatever reason
      expect(redeemReceipt).toMatchInlineGasSnapshot(`490107`);
    });

    it('happy path: registered aToken', async () => {
      // Register the aToken on the relevant list
      await aaveV2ATokenListOwner.addValidatedItemsToList([aToken]);

      const receipt = await aaveV2Redeem({
        aToken,
        aaveV2Adapter: fork.deployment.aaveV2Adapter,
        amount,
        comptrollerProxy,
        fundOwner,
        integrationManager: fork.deployment.integrationManager,
      });

      // This can vary substantially for whatever reason
      expect(receipt).toMatchInlineGasSnapshot(`446670`);
    });
  });
});
