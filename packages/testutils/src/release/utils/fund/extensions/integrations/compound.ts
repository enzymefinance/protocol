import { utils, Signer, BigNumberish } from 'ethers';
import { resolveAddress } from '@crestproject/crestproject';
import {
  ComptrollerLib,
  IntegrationManager,
  VaultLib,
  CompoundAdapter,
  ICERC20,
  StandardToken,
} from '@melonproject/protocol';
import { compoundArgs } from '../../../../integrations/compound';
import {
  callOnIntegrationArgs,
  lendSelector,
  integrationManagerActionIds,
  redeemSelector,
} from '../integrations/common';

export async function compoundLend({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  token,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  compoundAdapter: CompoundAdapter;
  token: StandardToken;
  cToken: ICERC20;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    await token.transfer(vaultProxy, tokenAmount);
  }

  const lendArgs = await compoundArgs({
    outgoingAsset: await resolveAddress(token),
    outgoingAssetAmount: tokenAmount,
    incomingAsset: await resolveAddress(cToken),
    minIncomingAssetAmount: cTokenAmount,
  });

  const callArgs = await callOnIntegrationArgs({
    adapter: compoundAdapter,
    selector: lendSelector,
    encodedCallArgs: lendArgs,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      integrationManagerActionIds.CallOnIntegration,
      callArgs,
    );

  return lendTx;
}

export async function compoundRedeem({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  token,
  cToken,
  tokenAmount = utils.parseEther('1'),
  cTokenAmount = utils.parseEther('1'),
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  compoundAdapter: CompoundAdapter;
  token: StandardToken;
  cToken: ICERC20;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    await cToken.transfer(vaultProxy, cTokenAmount);
  }

  const redeemArgs = await compoundArgs({
    outgoingAsset: await resolveAddress(cToken),
    outgoingAssetAmount: cTokenAmount,
    incomingAsset: await resolveAddress(token),
    minIncomingAssetAmount: tokenAmount,
  });

  const callArgs = await callOnIntegrationArgs({
    adapter: compoundAdapter,
    selector: redeemSelector,
    encodedCallArgs: redeemArgs,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      integrationManagerActionIds.CallOnIntegration,
      callArgs,
    );

  return redeemTx;
}
