import { resolveAddress, SignerWithAddress } from '@crestproject/crestproject';
import {
  callOnIntegrationArgs,
  CompoundAdapter,
  compoundArgs,
  ComptrollerLib,
  ICERC20,
  IntegrationManager,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
  VaultLib,
} from '@melonproject/protocol';
import { BigNumberish, utils } from 'ethers';

export async function compoundLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  cToken: ICERC20;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
}) {
  const lendArgs = await compoundArgs({
    cToken: resolveAddress(cToken),
    outgoingAssetAmount: tokenAmount,
    minIncomingAssetAmount: cTokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    selector: lendSelector,
    encodedCallArgs: lendArgs,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return lendTx;
}

export async function compoundRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundAdapter;
  cToken: ICERC20;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
}) {
  const redeemArgs = await compoundArgs({
    cToken: resolveAddress(cToken),
    outgoingAssetAmount: cTokenAmount,
    minIncomingAssetAmount: tokenAmount,
  });

  const callArgs = await callOnIntegrationArgs({
    adapter: compoundAdapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}
