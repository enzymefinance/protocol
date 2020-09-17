import { BigNumberish, Signer, utils } from 'ethers';
import {
  ChaiAdapter,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
} from '../../../../../utils/contracts';
import { IERC20 } from '../../../../../codegen/IERC20';
import { encodeArgs } from '../../../common';
import {
  callOnIntegrationArgs,
  callOnIntegrationSelector,
  lendSelector,
  redeemSelector,
} from './common';

export async function chaiLendArgs(
  outgoingDaiAmount: BigNumberish,
  expectedIncomingChaiAmount: BigNumberish,
) {
  return encodeArgs(
    ['uint256', 'uint256'],
    [outgoingDaiAmount, expectedIncomingChaiAmount],
  );
}

export async function chaiRedeemArgs(
  outgoingChaiAmount: BigNumberish,
  expectedIncomingDaiAmount: BigNumberish,
) {
  return encodeArgs(
    ['uint256', 'uint256'],
    [outgoingChaiAmount, expectedIncomingDaiAmount],
  );
}

export async function chaiLend({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  chaiAdapter,
  dai,
  daiAmount = utils.parseEther('1'),
  minChaiAmount = utils.parseEther('1'),
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  chaiAdapter: ChaiAdapter;
  dai: IERC20;
  daiAmount?: BigNumberish;
  minChaiAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough DAI for the tx
    await dai.transfer(vaultProxy, daiAmount);
  }

  const lendArgs = await chaiLendArgs(daiAmount, minChaiAmount);
  const callArgs = await callOnIntegrationArgs(
    chaiAdapter,
    lendSelector,
    lendArgs,
  );

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
  await expect(lendTx).resolves.toBeReceipt();

  return lendTx;
}

export async function chaiRedeem({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  chaiAdapter,
  chai,
  chaiAmount = utils.parseEther('1'),
  minDaiAmount = utils.parseEther('1'),
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  chaiAdapter: ChaiAdapter;
  chai: IERC20;
  chaiAmount?: BigNumberish;
  minDaiAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough CHAI for the tx
    await chai.transfer(vaultProxy, chaiAmount);
  }

  const redeemArgs = await chaiRedeemArgs(chaiAmount, minDaiAmount);
  const callArgs = await callOnIntegrationArgs(
    chaiAdapter,
    redeemSelector,
    redeemArgs,
  );

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
  await expect(redeemTx).resolves.toBeReceipt();

  return redeemTx;
}

export async function engineTakeOrderArgs(
  minNativeAssetAmount: BigNumberish,
  mlnTokenAmount: BigNumberish,
) {
  return encodeArgs(
    ['uint256', 'uint256'],
    [minNativeAssetAmount, mlnTokenAmount],
  );
}
