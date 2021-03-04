import { SignerWithAddress } from '@crestproject/crestproject';
import {
  AaveAdapter,
  aaveLendArgs,
  aaveRedeemArgs,
  lendSelector,
  SpendAssetsHandleType,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  createNewFund,
  ForkDeployment,
  getAssetBalances,
  loadForkDeployment,
  mainnetWhales,
  unlockWhales,
} from '@enzymefinance/testutils';
import { aaveLend, aaveRedeem } from '@enzymefinance/testutils/src/scaffolding/extensions/integrations/aave';
import { BigNumber, utils } from 'ethers';
import hre from 'hardhat';

let fork: ForkDeployment;

beforeEach(async () => {
  fork = await loadForkDeployment();
});

const gasAssertionTolerance = 0.03; // 3%
const whales: Record<string, SignerWithAddress> = {};

beforeAll(async () => {
  // Assign signers for whale accounts
  whales.usdc = ((await hre.ethers.getSigner(mainnetWhales.usdc)) as any) as SignerWithAddress;
  whales.ausdc = ((await hre.ethers.getSigner(mainnetWhales.ausdc)) as any) as SignerWithAddress;

  await unlockWhales({
    provider: hre.ethers.provider,
    whales: Object.values(whales),
  });
});

// HAPPY PATHS
describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
    });

    const outgoingToken = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const amount = utils.parseUnits('1', await outgoingToken.decimals());
    const incomingAToken = new StandardToken(fork.config.aave.aTokens.ausdc[0], whales.ausdc);

    await outgoingToken.transfer(vaultProxy, amount);

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAToken, outgoingToken],
    });

    const lendReceipt = await aaveLend({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      aaveAdapter: fork.deployment.AaveAdapter,
      outgoingToken,
      amount,
      incomingAToken,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAToken, outgoingToken],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(amount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(amount));

    expect(lendReceipt).toCostLessThan('499000', gasAssertionTolerance);
  });
});

describe('redeem', () => {
  it('works as expected when called for redeem by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fundOwner),
    });

    const outgoingAToken = new StandardToken(fork.config.aave.aTokens.ausdc[0], whales.ausdc);
    const amount = utils.parseUnits('1', await outgoingAToken.decimals());
    const incomingToken = new StandardToken(fork.config.primitives.usdc, hre.ethers.provider);

    await outgoingAToken.transfer(vaultProxy, amount);

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingToken, outgoingAToken],
    });

    const redeemReceipt = await aaveRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      aaveAdapter: fork.deployment.AaveAdapter,
      outgoingAToken,
      amount,
      incomingToken,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingToken, outgoingAToken],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(amount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(amount));

    expect(redeemReceipt).toCostLessThan(550000, gasAssertionTolerance);
  });
});

// TODO: Move this assertions to unit tests
describe('constructor', () => {
  it('sets state vars', async () => {
    const aaveAdapter = new AaveAdapter(fork.deployment.AaveAdapter, hre.ethers.provider);
    const lendingPoolAddressProvider = await aaveAdapter.getLendingPoolAddressProvider();
    expect(lendingPoolAddressProvider).toMatchAddress(fork.config.aave.lendingPoolAddressProvider);

    const referralCode = await aaveAdapter.getReferralCode();
    expect(referralCode).toEqBigNumber(BigNumber.from('158'));
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const aaveAdapter = new AaveAdapter(fork.deployment.AaveAdapter, hre.ethers.provider);
    const outgoingToken = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const amount = utils.parseUnits('1', await outgoingToken.decimals());
    const incomingAToken = new StandardToken(fork.config.aave.aTokens.ausdc[0], whales.ausdc);

    const args = aaveLendArgs({
      outgoingToken,
      amount,
      incomingAToken,
    });

    await expect(aaveAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(aaveAdapter.parseAssetsForMethod(lendSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const aaveAdapter = new AaveAdapter(fork.deployment.AaveAdapter, hre.ethers.provider);
    const outgoingToken = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const amount = utils.parseUnits('1', await outgoingToken.decimals());
    const incomingAToken = new StandardToken(fork.config.aave.aTokens.ausdc[0], whales.ausdc);

    const args = aaveLendArgs({
      outgoingToken,
      amount,
      incomingAToken,
    });

    await expect(aaveAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    const result = await aaveAdapter.parseAssetsForMethod(lendSelector, args);

    expect(result).toMatchFunctionOutput(aaveAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAToken.address],
      spendAssets_: [outgoingToken],
      spendAssetAmounts_: [amount],
      minIncomingAssetAmounts_: [amount],
    });
  });

  it('generates expected output for redeeming', async () => {
    const aaveAdapter = new AaveAdapter(fork.deployment.AaveAdapter, hre.ethers.provider);
    const outgoingAToken = new StandardToken(fork.config.aave.aTokens.ausdc[0], whales.ausdc);
    const amount = utils.parseUnits('1', await outgoingAToken.decimals());
    const incomingToken = new StandardToken(fork.config.primitives.usdc, hre.ethers.provider);

    const args = aaveRedeemArgs({
      outgoingAToken,
      amount,
      incomingToken,
    });

    const result = await aaveAdapter.parseAssetsForMethod(lendSelector, args);

    expect(result).toMatchFunctionOutput(aaveAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingToken.address],
      spendAssets_: [outgoingAToken],
      spendAssetAmounts_: [amount],
      minIncomingAssetAmounts_: [amount],
    });
  });
});
