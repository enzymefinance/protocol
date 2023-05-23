import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import {
  curveTakeOrderArgs,
  ETH_ADDRESS,
  ITestCurveAddressProvider,
  ITestCurveSwaps,
  ITestStandardToken,
  SpendAssetsHandleType,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { createNewFund, curveTakeOrder, deployProtocolFixture, setAccountBalance } from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

// There is variable small discrepancy between get_best_rate().maxAmountReceived and the actual amount received,
// likely due to rounding somewhere
const curveRoundingBuffer = 5;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

async function getCurveSwapsContract(addressProvider: AddressLike) {
  const curveAddressProvider = new ITestCurveAddressProvider(addressProvider, provider);
  const addr = await curveAddressProvider.get_address(2);

  return new ITestCurveSwaps(addr, provider);
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const curveExchangeAdapter = fork.deployment.curveExchangeAdapter;

    const getIntegrationManagerCall = await curveExchangeAdapter.getIntegrationManager();

    expect(getIntegrationManagerCall).toMatchAddress(fork.deployment.integrationManager);

    const getAddressProvider = await curveExchangeAdapter.getCurveExchangeAddressProvider();

    expect(getAddressProvider).toMatchAddress(fork.config.curve.addressProvider);

    const getWethTokenCall = await curveExchangeAdapter.getCurveExchangeWethToken();

    expect(getWethTokenCall).toMatchAddress(fork.config.weth);
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const curveExchangeAdapter = fork.deployment.curveExchangeAdapter;

    await expect(
      curveExchangeAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  it('does not allow empty _pool address', async () => {
    const curveExchangeAdapter = fork.deployment.curveExchangeAdapter;
    const pool = constants.AddressZero;
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('0.1');
    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('0.3');

    await expect(
      curveExchangeAdapter.parseAssetsForAction(
        randomAddress(),
        takeOrderSelector,
        curveTakeOrderArgs({
          incomingAsset,
          minIncomingAssetAmount,
          outgoingAsset,
          outgoingAssetAmount,
          pool,
        }),
      ),
    ).rejects.toBeRevertedWith('No pool address provided');
  });

  it('generates expected output', async () => {
    const curveExchangeAdapter = fork.deployment.curveExchangeAdapter;
    const pool = randomAddress();
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('0.1');
    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('0.3');

    const result = await curveExchangeAdapter.parseAssetsForAction(
      randomAddress(),
      takeOrderSelector,
      curveTakeOrderArgs({
        incomingAsset,
        minIncomingAssetAmount,
        outgoingAsset,
        outgoingAssetAmount,
        pool,
      }),
    );

    expect(result).toMatchFunctionOutput(curveExchangeAdapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
      spendAssetAmounts_: [outgoingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });
});

describe('takeOrder', () => {
  it('works as expected when called by a fund (ERC20 to ERC20)', async () => {
    const outgoingAsset = new ITestStandardToken(fork.config.primitives.dai, provider);
    const incomingAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const curveSwaps = await getCurveSwapsContract(fork.config.curve.addressProvider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const outgoingAssetAmount = utils.parseEther('1');

    const { bestPool_, amountReceived_ } = await curveSwaps.get_best_rate(
      outgoingAsset.address,
      incomingAsset.address,
      outgoingAssetAmount,
    );

    await setAccountBalance({ provider, account: vaultProxy, amount: outgoingAssetAmount, token: outgoingAsset });

    // exchange
    await curveTakeOrder({
      comptrollerProxy,
      curveExchangeAdapter: fork.deployment.curveExchangeAdapter,
      fundOwner,
      incomingAsset,
      integrationManager: fork.deployment.integrationManager,
      minIncomingAssetAmount: BigNumber.from(1),
      outgoingAsset,
      outgoingAssetAmount,
      pool: bestPool_,
    });

    expect(await incomingAsset.balanceOf(vaultProxy)).toBeAroundBigNumber(amountReceived_, curveRoundingBuffer);
    expect(await outgoingAsset.balanceOf(vaultProxy)).toEqBigNumber(0);
  });

  it('works as expected when called by a fund (ETH to ERC20)', async () => {
    const outgoingAsset = new ITestStandardToken(fork.config.weth, provider);
    const incomingAsset = new ITestStandardToken(fork.config.primitives.steth, provider);
    const curveSwaps = await getCurveSwapsContract(fork.config.curve.addressProvider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const outgoingAssetAmount = utils.parseEther('1');

    const { bestPool_, amountReceived_ } = await curveSwaps.get_best_rate(
      ETH_ADDRESS,
      incomingAsset.address,
      outgoingAssetAmount,
    );

    await setAccountBalance({ provider, account: vaultProxy, amount: outgoingAssetAmount, token: outgoingAsset });

    // exchange
    await curveTakeOrder({
      comptrollerProxy,
      curveExchangeAdapter: fork.deployment.curveExchangeAdapter,
      fundOwner,
      incomingAsset,
      integrationManager: fork.deployment.integrationManager,
      minIncomingAssetAmount: BigNumber.from(1),
      outgoingAsset,
      outgoingAssetAmount,
      pool: bestPool_,
    });

    expect(await incomingAsset.balanceOf(vaultProxy)).toBeAroundBigNumber(amountReceived_, curveRoundingBuffer);
    expect(await outgoingAsset.balanceOf(vaultProxy)).toEqBigNumber(0);
  });

  it('works as expected when called by a fund (ERC20 to ETH)', async () => {
    const outgoingAsset = new ITestStandardToken(fork.config.primitives.steth, provider);
    const incomingAsset = new ITestStandardToken(fork.config.weth, provider);
    const curveSwaps = await getCurveSwapsContract(fork.config.curve.addressProvider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const outgoingAssetAmount = utils.parseEther('1');

    const { bestPool_, amountReceived_ } = await curveSwaps.get_best_rate(
      outgoingAsset.address,
      ETH_ADDRESS,
      outgoingAssetAmount,
    );

    await setAccountBalance({ provider, account: vaultProxy, amount: outgoingAssetAmount, token: outgoingAsset });

    // exchange
    await curveTakeOrder({
      comptrollerProxy,
      curveExchangeAdapter: fork.deployment.curveExchangeAdapter,
      fundOwner,
      incomingAsset,
      integrationManager: fork.deployment.integrationManager,
      minIncomingAssetAmount: BigNumber.from(1),
      outgoingAsset,
      outgoingAssetAmount,
      pool: bestPool_,
    });

    expect(await incomingAsset.balanceOf(vaultProxy)).toBeAroundBigNumber(amountReceived_, curveRoundingBuffer);
    expect(await outgoingAsset.balanceOf(vaultProxy)).toEqBigNumber(0);
  });
});
