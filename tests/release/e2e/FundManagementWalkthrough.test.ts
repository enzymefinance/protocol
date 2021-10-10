import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  convertRateToScaledPerSecondRate,
  entranceRateBurnFeeConfigArgs,
  feeManagerConfigArgs,
  addressListRegistryPolicyArgs,
  managementFeeConfigArgs,
  performanceFeeConfigArgs,
  StandardToken,
  VaultLib,
  AddressListUpdateType,
} from '@enzymefinance/protocol';
import {
  addTrackedAssetsToVault,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  ProtocolDeployment,
  redeemSharesInKind,
  uniswapV2TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, BigNumberish, utils } from 'ethers';

const FIVE_PERCENT = BigNumber.from(500);
const TEN_PERCENT = BigNumber.from(1000);
const ONE_HUNDRED_PERCENT = BigNumber.from(10000);
const tempTolerance = 10000;

const expectedGasCosts = {
  'buy shares: denomination asset only: first investment': {
    usdc: 375185,
    weth: 351805,
  },
  'buy shares: denomination asset only: second investment': {
    usdc: 376445,
    weth: 359608,
  },
  'buy shares: max assets': {
    usdc: 1427227,
    weth: 1328068,
  },
  'calc gav: 20 assets': {
    usdc: 1119268,
    weth: 1033190,
  },
  'calc gav: denomination asset only': {
    usdc: 79832,
    weth: 70297,
  },
  'create fund': {
    usdc: 900449,
    weth: 889940,
  },
  'redeem partial shares: max assets': {
    usdc: 2562191,
    weth: 2466944,
  },
  'redeem all shares: max assets': {
    usdc: 2073538,
    weth: 2000643,
  },
  'trade on Uniswap: max assets': {
    usdc: 255482,
    weth: 229688,
  },
} as const;

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
      const scaledPerSecondRate = convertRateToScaledPerSecondRate(utils.parseEther('0.01')); // 1%
      const managementFeeSettings = managementFeeConfigArgs({ scaledPerSecondRate });
      const performanceFeeSettings = performanceFeeConfigArgs({
        rate: TEN_PERCENT,
        period: 365 * 24 * 60 * 60,
      });
      const entranceRateBurnFeeSettings = entranceRateBurnFeeConfigArgs({ rate: FIVE_PERCENT });

      const feeManagerConfig = feeManagerConfigArgs({
        fees: [fork.deployment.managementFee, fork.deployment.performanceFee, fork.deployment.entranceRateBurnFee],
        settings: [managementFeeSettings, performanceFeeSettings, entranceRateBurnFeeSettings],
      });

      // TODO: add policies

      const createFundTx = await createNewFund({
        signer: manager,
        fundDeployer: fork.deployment.fundDeployer,
        fundOwner: manager,
        denominationAsset,
        feeManagerConfig,
      });

      comptrollerProxy = createFundTx.comptrollerProxy;
      vaultProxy = createFundTx.vaultProxy;

      expect(createFundTx.receipt).toCostAround(expectedGasCosts['create fund'][denominationAssetId]);
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
                updateType: AddressListUpdateType.None,
                initialItems: [randomAddress(), randomAddress(), investor.address],
              },
            ],
          }),
        )
        .send();

      expect(enabled).toBeReceipt();
    });

    it('buys shares of a fund', async () => {
      const buySharesTx = await buyShares({
        comptrollerProxy,
        buyer: investor,
        denominationAsset,
      });

      const rate = FIVE_PERCENT;
      const rateDivisor = ONE_HUNDRED_PERCENT;
      const expectedFee = utils.parseUnits('1', denominationAssetDecimals).mul(rate).div(rateDivisor);

      expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(
        utils.parseUnits('1', denominationAssetDecimals).sub(expectedFee),
      );

      expect(buySharesTx).toCostAround(
        expectedGasCosts['buy shares: denomination asset only: first investment'][denominationAssetId],
      );
    });

    it('buys more shares of a fund', async () => {
      const previousBalance = await vaultProxy.balanceOf(investor);

      const minSharesAmount = utils.parseUnits('0.00001', denominationAssetDecimals);
      const buySharesTx = await buyShares({
        comptrollerProxy,
        buyer: investor,
        denominationAsset,
      });

      expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(minSharesAmount.add(previousBalance));

      expect(buySharesTx).toCostAround(
        expectedGasCosts['buy shares: denomination asset only: second investment'][denominationAssetId],
      );
    });

    it('calculates the GAV of the fund with only the denomination asset', async () => {
      const calcGavTx = await comptrollerProxy.calcGav(true);

      expect(calcGavTx).toCostAround(expectedGasCosts['calc gav: denomination asset only'][denominationAssetId]);
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
        signer: manager,
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        assets,
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
        signer: manager,
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        assets: compoundAssets,
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

      const calcGavTx = await comptrollerProxy.calcGav(true);

      expect(calcGavTx).toCostAround(expectedGasCosts['calc gav: 20 assets'][denominationAssetId]);
    });

    it('trades on Uniswap', async () => {
      const receipt = await uniswapV2TakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner: manager,
        uniswapV2ExchangeAdapter: fork.deployment.uniswapV2ExchangeAdapter,
        path: [denominationAsset, new StandardToken(fork.config.primitives.dai, provider)],
        outgoingAssetAmount: utils.parseUnits('0.1', denominationAssetDecimals),
        minIncomingAssetAmount: BigNumber.from(1),
      });

      expect(receipt).toCostAround(expectedGasCosts['trade on Uniswap: max assets'][denominationAssetId]);
    });

    it("sends an asset amount to the fund's vault", async () => {
      const gavBefore = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

      const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
      const amount = utils.parseEther('1');

      await dai.transfer(vaultProxy, amount);

      const gavAfter = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueAfter = await comptrollerProxy.calcGrossShareValue.call();

      expect(gavAfter).toBeGtBigNumber(gavBefore);
      expect(grossShareValueAfter).toBeGtBigNumber(grossShareValueBefore);
    });

    it('redeems some shares of the investor (without fees failure)', async () => {
      const balance = await vaultProxy.balanceOf(investor);
      const redeemQuantity = balance.div(2);

      const redeemed = await redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
        quantity: redeemQuantity,
      });

      const failureEvents = extractEvent(redeemed, 'PreRedeemSharesHookFailed');
      expect(failureEvents.length).toBe(0);

      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(balance.sub(redeemQuantity));

      expect(redeemed).toCostAround(
        expectedGasCosts['redeem partial shares: max assets'][denominationAssetId],
        tempTolerance,
      );
    });

    it("sends an asset amount to the fund's vault again", async () => {
      const gavBefore = await comptrollerProxy.calcGav.args(true).call();
      const grossShareValueBefore = await comptrollerProxy.calcGrossShareValue.call();

      const zrx = new StandardToken(fork.config.primitives.zrx, whales.zrx);
      const amount = utils.parseEther('1');

      await zrx.transfer(vaultProxy, amount);

      const gavAfter = await comptrollerProxy.calcGav.args(true).call();
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
            newListsArgs: [{ updateType: AddressListUpdateType.None, initialItems: [anotherInvestor] }],
          }),
        )
        .send();
    });

    it('buy shares: max assets', async () => {
      const buySharesTx = await buyShares({
        comptrollerProxy,
        buyer: anotherInvestor,
        denominationAsset,
      });

      expect(buySharesTx).toCostAround(expectedGasCosts['buy shares: max assets'][denominationAssetId]);
    });

    it('redeems all remaining shares of the first investor (without fees failure)', async () => {
      const redeemed = await redeemSharesInKind({
        comptrollerProxy,
        signer: investor,
      });

      const failureEvents = extractEvent(redeemed, 'PreRedeemSharesHookFailed');
      expect(failureEvents.length).toBe(0);

      expect(await vaultProxy.balanceOf(investor)).toEqBigNumber(utils.parseEther('0'));

      expect(redeemed).toCostAround(
        expectedGasCosts['redeem all shares: max assets'][denominationAssetId],
        tempTolerance,
      );
    });
  },
);
