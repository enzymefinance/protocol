import { BigNumberish, Signer, utils } from 'ethers';
import { IERC20 } from '../../../../../codegen/IERC20';
import {
  ComptrollerLib,
  EngineAdapter,
  IntegrationManager,
  VaultLib,
} from '../../../../../utils/contracts';
import { encodeArgs } from '../../../common';
import {
  callOnIntegrationArgs,
  callOnIntegrationSelector,
  takeOrderSelector,
} from './common';

export async function engineAdapterTakeOrderArgs({
  minWethAmount,
  mlnAmount,
}: {
  minWethAmount: BigNumberish;
  mlnAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [minWethAmount, mlnAmount]);
}

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
  fundOwner: Signer;
  engineAdapter: EngineAdapter;
  mln: IERC20;
  mlnAmount?: BigNumberish;
  minWethAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough for the tx
    await mln.transfer(vaultProxy, mlnAmount);
  }

  const takeOrderArgs = await engineAdapterTakeOrderArgs({
    minWethAmount,
    mlnAmount,
  });

  const callArgs = await callOnIntegrationArgs({
    adapter: engineAdapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  const takeOrderTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
  await expect(takeOrderTx).resolves.toBeReceipt();

  return takeOrderTx;
}
