import { AddressLike } from '@crestproject/crestproject';
import { BigNumberish, BytesLike, Signer } from 'ethers';
import { ComptrollerLib } from '../../../../utils/contracts';

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
  signer?: Signer;
}) {
  let callOnExtensionTx: any;

  if (signer) {
    callOnExtensionTx = comptrollerProxy
      .connect(signer)
      .callOnExtension(extension, actionId, callArgs);
  } else {
    callOnExtensionTx = comptrollerProxy.callOnExtension(
      extension,
      actionId,
      callArgs,
    );
  }
  await expect(callOnExtensionTx).resolves.toBeReceipt();

  return callOnExtensionTx;
}
