import { BigNumberish, utils } from 'ethers';
import { SignerWithAddress } from '@crestproject/crestproject';
import {
  ChaiAdapter,
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
  StandardToken,
  redeemSelector,
  callOnIntegrationArgs,
  chaiLendArgs,
  chaiRedeemArgs,
  IntegrationManagerActionId,
  lendSelector,
} from '@melonproject/protocol';

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
  fundOwner: SignerWithAddress;
  chaiAdapter: ChaiAdapter;
  dai: StandardToken;
  daiAmount?: BigNumberish;
  minChaiAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough DAI for the tx
    await dai.transfer(vaultProxy, daiAmount);
  }

  const lendArgs = chaiLendArgs({
    outgoingDaiAmount: daiAmount,
    expectedIncomingChaiAmount: minChaiAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: chaiAdapter,
    selector: lendSelector,
    encodedCallArgs: lendArgs,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      IntegrationManagerActionId.CallOnIntegration,
      callArgs,
    );
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
  fundOwner: SignerWithAddress;
  chaiAdapter: ChaiAdapter;
  chai: StandardToken;
  chaiAmount?: BigNumberish;
  minDaiAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough CHAI for the tx
    await chai.transfer(vaultProxy, chaiAmount);
  }

  const redeemArgs = chaiRedeemArgs({
    outgoingChaiAmount: chaiAmount,
    expectedIncomingDaiAmount: minDaiAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: chaiAdapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      IntegrationManagerActionId.CallOnIntegration,
      callArgs,
    );

  await expect(redeemTx).resolves.toBeReceipt();

  return redeemTx;
}
