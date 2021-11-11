import type { AddressLike, Contract, Send } from '@enzymefinance/ethers';
import { contract, resolveAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { CompoundAdapter, IntegrationManager, VaultLib } from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  compoundArgs,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';
import { utils } from 'ethers';

import type { ComptrollerLib } from '../../../../../protocol/src/codegen/ComptrollerLib';

export interface ICompoundComptroller extends Contract<ICompoundComptroller> {
  claimComp: Send<(_account: AddressLike) => void>;
}

export const ICompoundComptroller = contract<ICompoundComptroller>()`
  function claimComp(address)
`;

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
  cToken: AddressLike;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
}) {
  const lendArgs = compoundArgs({
    cToken,
    minIncomingAssetAmount: cTokenAmount,
    outgoingAssetAmount: tokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    encodedCallArgs: lendArgs,
    selector: lendSelector,
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
  cToken: AddressLike;
  tokenAmount?: BigNumberish;
  cTokenAmount?: BigNumberish;
}) {
  const redeemArgs = compoundArgs({
    cToken: resolveAddress(cToken),
    minIncomingAssetAmount: tokenAmount,
    outgoingAssetAmount: cTokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    encodedCallArgs: redeemArgs,
    selector: redeemSelector,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}
