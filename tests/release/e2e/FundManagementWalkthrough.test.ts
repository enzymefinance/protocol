import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  addressListRegistryPolicyArgs,
  AddressListUpdateType,
  entranceRateBurnFeeConfigArgs,
  feeManagerConfigArgs,
  managementFeeConfigArgs,
  managementFeeConvertRateToScaledPerSecondRate,
  performanceFeeConfigArgs,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  addTrackedAssetsToVault,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  redeemSharesInKind,
  uniswapV2TakeOrder,
} from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { BigNumber, utils } from 'ethers';

const FIVE_PERCENT = BigNumber.from(500);
const TEN_PERCENT = BigNumber.from(1000);
const ONE_HUNDRED_PERCENT = BigNumber.from(10000);

describe.each([['weth' as const], ['usdc' as const]])(
  'Walkthrough for %s as denomination asset',
  (denominationAssetId) => {
    let fork: ProtocolDeployment;
    let manager: SignerWithAddress;
    let investor: SignerWithAddress;
    let anotherInvestor: SignerWithAddress;

    let comptrollerProxy: ComptrollerLib;
    let vaultProxy: VaultLib;
    let denominationAsset: StandardToken;
    let denominationAssetDecimals: BigNumberish;

    beforeAll(async () => {
      fork = await deployProtocolFixture();

      manager = fork.accounts[1];
      investor = fork.accounts[2];
      anotherInvestor = fork.accounts[3];

      denominationAsset =
        denominationAssetId === 'weth'
          ? new StandardToken(fork.config.weth, whales.weth)
          : new StandardToken(fork.config.primitives[denominationAssetId], whales[denominationAssetId]);
      denominationAssetDecimals = await denominationAsset.decimals();

      // Seed investors with denomination asset
      const denominationAssetSeedAmount = utils.parseUnits('100', await denominationAsset.decimals());

      await denominationAsset.transfer(investor, denominationAssetSeedAmount);
      await denominationAsset.transfer(anotherInvestor, denominationAssetSeedAmount);
    });

    it('creates a new fund', async () => {
      // fees
      const scaledPerSecondRate = managementFeeConvertRateToScaledPerSecondRate(utils.parseEther('0.01')); // 1%
      const managementFeeSettings = managementFeeConfigArgs({ scaledPerSecondRate });
      const performanceFeeSettings = performanceFeeConfigArgs({
        rate: TEN_PERCENT,
      });
      const entranceRateBurnFeeSettings = entranceRateBurnFeeConfigArgs({ rate: FIVE_PERCENT });

      const feeManagerConfig = feeManagerConfigArgs({
        fees: [fork.deployment.managementFee, fork.deployment.performanceFee, fork.deployment.entranceRateBurnFee],
        settings: [managementFeeSettings, performanceFeeSettings, entranceRateBurnFeeSettings],
      });

      // TODO: add policies

      const createFundTx = await createNewFund({
        denominationAsset,
        feeManagerConfig,
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner: manager,
        signer: manager,
      });

      comptrollerProxy = createFundTx.comptrollerProxy;
      vaultProxy = createFundTx.vaultProxy;

      expect(createFundTx.receipt).toMatchGasSnapshot(denominationAssetId);
    });

    it('enables the AllowedDepositRecipientsPolicy policy for the fund', async () => {
      const enabled = await fork.deployment.policyManager
        .connect(manager)
        .enablePolicyForFund.args(
          comptrollerProxy.address,
          fork.deployment.allowedDepositRecipientsPolicy,
          addressListRegistryPolicyArgs({
            newListsArgs: [
              {
                initialItems: [randomAddress(), randomAddress(), investor.address],
                updateType: AddressListUpdateType.None,
              },
            ],
          }),
        )
        .send();

      expect(enabled).toBeReceipt();
    });

    it('buys shares of a fund', async () => {
      const buySharesTx = await buyShares({
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
      });

      const rate = FIVE_PERCENT;
      const rateDivisor = ONE_HUNDRED_PERCENT;
      const expectedFee = utils.parseUnits('1', denominationAssetDecimals).mul(rate).div(rateDivisor);

      expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(
        utils.parseUnits('1', denominationAssetDecimals).sub(expectedFee),
      );

      expect(buySharesTx).toMatchGasSnapshot(denominationAssetId);
    });

    it('buys more shares of a fund', async () => {
      const previousBalance = await vaultProxy.balanceOf(investor);

      const minSharesAmount = utils.parseUnits('0.00001', denominationAssetDecimals);
      const buySharesTx = await buyShares({
        buyer: investor,
        comptrollerProxy,
        denominationAsset,
      });

      expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(minSharesAmount.add(previousBalance));

      expect(buySharesTx).toMatchGasSnapshot(denominationAssetId);
    });

    it('calculates the GAV of the fund with only the denomination asset', async () => {
      const calcGavTx = await comptrollerProxy.calcGav();

      expect(calcGavTx).toMatchGasSnapshot(denominationAssetId);
    });

    it('seeds the fund with all more assets', async () => {
      const assets = [
        new StandardToken(fork.config.primitives.bat, whales.bat),
        new StandardToken(fork.config.primitives.bnb, whales.bnb),
        new StandardToken(fork.config.primitives.bnt, whales.bnt),
        new StandardToken(fork.config.primitives.comp, whales.comp),
        new StandardToken(fork.config.primitives.dai, whales.dai),
        new StandardToken(fork.config.primitives.link, whales.link),
        new StandardToken(fork.config.primitives.mana, whales.mana),
        new StandardToken(fork.config.primitives.mln, whales.mln),
        new StandardToken(fork.config.primitives.ren, whales.ren),
        new StandardToken(fork.config.primitives.rep, whales.rep),
        new StandardToken(fork.config.primitives.susd, whales.susd),
        new StandardToken(fork.config.primitives.uni, whales.uni),
        new StandardToken(fork.config.primitives.usdt, whales.usdt),
        new StandardToken(fork.config.primitives.zrx, whales.zrx),
      ];

      await addTrackedAssetsToVault({
        assets,
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        signer: manager,
      });

      // Use this loop instead of addNewAssetsToFund() to make debugging easier
      // when a whale changes.
      for (const asset of assets) {
        const decimals = await asset.decimals();
        const transferAmount = utils.parseUnits('1', decimals);

        await asset.transfer(vaultProxy, transferAmount);

        const balance = await asset.balanceOf(vaultProxy);

        expect(balance).toBeGteBigNumber(transferAmount);
      }
    });

    it('seeds the fund with cTokens', async () => {
      const compoundAssets = [
        new StandardToken(fork.config.compound.ctokens.ccomp, whales.ccomp),
        new StandardToken(fork.config.compound.ctokens.cdai, whales.cdai),
        new StandardToken(fork.config.compound.ceth, whales.ceth),
        new StandardToken(fork.config.compound.ctokens.cusdc, whales.cusdc),
        new StandardToken(fork.config.compound.ctokens.cuni, whales.cuni),
      ];

      await addTrackedAssetsToVault({
        assets: compoundAssets,
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        signer: manager,
      });

      // Use this loop instead of addNewAssetsToFund() to make debugging easier
      // when a whale changes.
      for (const asset of compoundAssets) {
        const decimals = await asset.decimals();
        const transferAmount = utils.parseUnits('1', decimals);

        await asset.transfer(vaultProxy, transferAmount);

        const balance = await asset.balanceOf(vaultProxy);

        expect(balance).toBeGteBigNumber(transferAmount);
      }
    });

    it('calculates the GAV of the fund with 20 assets', async () => {
      expect((await vaultProxy.getTrackedAssets()).length).toBe(20);

      const calcGavTx = await comptrollerProxy.calcGav();

      expect(calcGavTx).toMatchGasSnapshot(denominationAssetId);
    });

    it('trades on Uniswap', async () => {
      const receipt = await uniswapV2TakeOrder({
        comptrollerProxy,
        fundOwner: manager,
        integrationManager: fork.deployment.integrationManager,
        minIncomingAssetAmount: BigNumber.from(1),
        outgoingAssetAmount: utils.parseUnits('0.1', denominationAssetDecimals),
        path: [denominationAsset, new StandardToken(fork.config.primitives.dai, provider)],
        uniswapV2ExchangeAdapter: fork.deployment.uniswapV2ExchangeAdapter,
        vaultProxy,
      });

      expect(receipt).toMatchGasSnapshot(denominationAssetId);
    });

    it("sends an asset amount to the fund's vault", async () => {
      const gavBefore = await comptrollerProxy.calcGav.args().call();
      const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

      const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
      const amount = utils.parseEther('1');

      await dai.transfer(vaultProxy, amount);

      const gavAfter = await comptrollerProxy.calcGav.args().call();
      const grossShareValueAfter = await comptrollerProxy.calcGrossShareValue.call();

      expect(gavAfter).toBeGtBigNumber(gavBefore);
      expect(grossShareValueAfter).toBeGtBigNumber(grossShareValueBefore);
    });

    it('redeems some shares of the investor (without fees failure)', async () => {
      const balance = await vaultProxy.balanceOf(investor);
      const redeemQuantity = balance.div(2);

      const redeemed = await redeemSharesInKind({
        comptrollerProxy,
        quantity: redeemQuantity,
        signer: investor,
      });

      const failureEvents = extractEvent(redeemed, 'PreRedeemSharesHookFailed');

      expect(failureEvents.length).toBe(0);

      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(balance.sub(redeemQuantity));

      expect(redeemed).toMatchGasSnapshot(denominationAssetId);
    });

    it("sends an asset amount to the fund's vault again", async () => {
      const gavBefore = await comptrollerProxy.calcGav.args().call();
      const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

      const zrx = new StandardToken(fork.config.primitives.zrx, whales.zrx);
      const amount = utils.parseEther('1');

      await zrx.transfer(vaultProxy, amount);

      const gavAfter = await comptrollerProxy.calcGav.args().call();
      const grossShareValueAfter = await comptrollerProxy.calcGrossShareValue.call();

      expect(gavAfter).toBeGtBigNumber(gavBefore);
      expect(grossShareValueAfter).toBeGtBigNumber(grossShareValueBefore);
    });

    it('changes the AllowedDepositRecipientsPolicy', async () => {
      await fork.deployment.policyManager
        .connect(manager)
        .updatePolicySettingsForFund.args(
          comptrollerProxy.address,
          fork.deployment.allowedDepositRecipientsPolicy,
          addressListRegistryPolicyArgs({
            newListsArgs: [{ initialItems: [anotherInvestor], updateType: AddressListUpdateType.None }],
          }),
        )
        .send();
    });

    it('buy shares: max assets', async () => {
      const buySharesTx = await buyShares({
        buyer: anotherInvestor,
        comptrollerProxy,
        denominationAsset,
      });

      expect(buySharesTx).toMatchGasSnapshot(denominationAssetId);
    });

    it('redeems all remaining shares of the first investor (without fees failure)', async () => {
      const redeemed = await redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
      });

      const failureEvents = extractEvent(redeemed, 'PreRedeemSharesHookFailed');

      expect(failureEvents.length).toBe(0);

      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(utils.parseEther('0'));

      expect(redeemed).toMatchGasSnapshot(denominationAssetId);
    });
  },
);
