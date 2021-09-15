import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib } from '@enzymefinance/protocol';
import { BigNumberish, BytesLike } from 'ethers';

export async function callOnExtension({
  comptrollerProxy,
  extension,
  actionId,
  callArgs = '0x',
  signer,
}: {
  comptrollerProxy: ComptrollerLib;
  extension: AddressLike;
  actionId: BigNumberish;
  callArgs?: BytesLike;
  signer?: SignerWithAddress;
}) {
  const connectedComptrollerProxy = signer ? comptrollerProxy.connect(signer) : comptrollerProxy;
  return connectedComptrollerProxy.callOnExtension(extension, actionId, callArgs);
}
