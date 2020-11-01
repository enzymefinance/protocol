import { BigNumberish, utils } from 'ethers';
import { SignerWithAddress } from '@crestproject/crestproject';
import {
  StandardToken,
  ComptrollerLib,
  EngineAdapter,
  IntegrationManager,
  VaultLib,
  IntegrationManagerActionId,
  callOnIntegrationArgs,
  takeOrderSelector,
  engineTakeOrderArgs,
} from '@melonproject/protocol';

export async function engineAdapterTakeOrder({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  engineAdapter,
  mln,
  mlnAmount = utils.parseEther('1'),
  minWethAmount = utils.parseEther('1'),
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  engineAdapter: EngineAdapter;
  mln: StandardToken;
  mlnAmount?: BigNumberish;
  minWethAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough for the tx
    await mln.transfer(vaultProxy, mlnAmount);
  }

  const takeOrderArgs = engineTakeOrderArgs({
    minWethAmount,
    mlnAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: engineAdapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  const takeOrderTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      IntegrationManagerActionId.CallOnIntegration,
      callArgs,
    );

  await expect(takeOrderTx).resolves.toBeReceipt();

  return takeOrderTx;
}
