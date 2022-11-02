import { randomAddress } from '@enzymefinance/ethers';
import type { ComptrollerLib, ITestAddOnlyAddressListOwner, VaultLib } from '@enzymefinance/protocol';
import {
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
import type { IIntegrationAdapter } from 'src/codegen/IIntegrationAdapter';

const roundingBuffer = BigNumber.from(2);
let fork: ProtocolDeployment;
let aaveAdapter: IIntegrationAdapter, aTokenListOwner: ITestAddOnlyAddressListOwner;
let aToken: ITestStandardToken, underlying: ITestStandardToken;

const adapterKeys = ['aaveV2'];
describe.each(adapterKeys)('%s as adapter', (adapterKey) => {
  beforeEach(async () => {
    fork = await deployProtocolFixture();

    // Adapter-specific vars
    switch (adapterKey) {
      case 'aaveV2':
        aaveAdapter = fork.deployment.aaveV2Adapter;
        aTokenListOwner = fork.deployment.aaveV2ATokenListOwner;

        aToken = new ITestStandardToken(fork.config.aaveV2.atokens.ausdc, provider);
        underlying = new ITestStandardToken(fork.config.primitives.usdc, provider);

        break;
    }
  });

  describe('parseAssetsForAction', () => {
    it('does not allow a bad selector', async () => {
      const amount = utils.parseUnits('1', await underlying.decimals());

      const args = aaveV2LendArgs({
        aToken,
        amount,
      });

      await expect(
        aaveAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
      ).rejects.toBeRevertedWith('_selector invalid');

      await expect(aaveAdapter.parseAssetsForAction(randomAddress(), lendSelector, args)).resolves.toBeTruthy();
    });

    it('generates expected output for lending', async () => {
      const amount = utils.parseUnits('1', await underlying.decimals());

      const args = aaveV2LendArgs({
        aToken,
        amount,
      });

      await expect(
        aaveAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
      ).rejects.toBeRevertedWith('_selector invalid');

      const result = await aaveAdapter.parseAssetsForAction(randomAddress(), lendSelector, args);

      expect(result).toMatchFunctionOutput(aaveAdapter.parseAssetsForAction, {
        incomingAssets_: [aToken],
        minIncomingAssetAmounts_: [amount.sub(roundingBuffer)],
        spendAssetAmounts_: [amount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [underlying],
      });
    });

    it('generates expected output for redeeming', async () => {
      const amount = utils.parseUnits('1', await aToken.decimals());

      const args = aaveV2RedeemArgs({
        aToken,
        amount,
      });

      const result = await aaveAdapter.parseAssetsForAction(randomAddress(), redeemSelector, args);

      expect(result).toMatchFunctionOutput(aaveAdapter.parseAssetsForAction, {
        incomingAssets_: [underlying],
        minIncomingAssetAmounts_: [amount.sub(roundingBuffer)],
        spendAssetAmounts_: [amount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [aToken],
      });
    });
  });

  describe('actions', () => {
    let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
    let fundOwner: SignerWithAddress;

    beforeEach(async () => {
      [fundOwner] = fork.accounts;

      const newFundRes = await createNewFund({
        denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, fundOwner),
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner,
        signer: fundOwner,
      });

      comptrollerProxy = newFundRes.comptrollerProxy;
      vaultProxy = newFundRes.vaultProxy;

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

        const receipt = await aaveV2Lend({
          aToken,
          aaveV2Adapter: aaveAdapter,
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

        expect(receipt).toMatchGasSnapshot(adapterKey);
      });

      it('happy path: registered aToken', async () => {
        // Register the aToken on the relevant list
        await aTokenListOwner.addValidatedItemsToList([aToken]);

        const receipt = await aaveV2Lend({
          aToken,
          aaveV2Adapter: aaveAdapter,
          amount,
          comptrollerProxy,
          fundOwner,
          integrationManager: fork.deployment.integrationManager,
        });

        expect(receipt).toMatchGasSnapshot(adapterKey);
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

        const receipt = await aaveV2Redeem({
          aToken,
          aaveV2Adapter: aaveAdapter,
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
        expect(receipt).toMatchGasSnapshot(adapterKey);
      });

      it('happy path: registered aToken', async () => {
        // Register the aToken on the relevant list
        await aTokenListOwner.addValidatedItemsToList([aToken]);

        const receipt = await aaveV2Redeem({
          aToken,
          aaveV2Adapter: aaveAdapter,
          amount,
          comptrollerProxy,
          fundOwner,
          integrationManager: fork.deployment.integrationManager,
        });

        // This can vary substantially for whatever reason
        expect(receipt).toMatchGasSnapshot(adapterKey);
      });
    });
  });
});
