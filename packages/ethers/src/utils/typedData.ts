import type { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer';
import type { providers } from 'ethers';
import { utils } from 'ethers';

export interface TypedData {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  value: Record<string, any>;
}

export interface TypedDataPayload {
  types: Record<string, TypedDataField[]>;
  domain: TypedDataDomain;
  primaryType: string;
  message: any;
}

export async function getTypedDataPayload(
  provider: providers.JsonRpcProvider,
  domain: TypedDataDomain,
  types: Record<string, TypedDataField[]>,
  value: Record<string, any>,
): Promise<TypedDataPayload> {
  const populated = await utils._TypedDataEncoder.resolveNames(domain, types, value, async (name: string) => {
    const resolved = await provider.resolveName(name);

    // eslint-disable-next-line eqeqeq
    if (resolved == null) {
      throw new Error(`Failed to resolve name ${name}`);
    }

    return resolved;
  });

  return utils._TypedDataEncoder.getPayload(populated.domain, types, populated.value);
}

export async function getTypedDataMessage(
  provider: providers.JsonRpcProvider,
  domain: TypedDataDomain,
  types: Record<string, TypedDataField[]>,
  value: Record<string, any>,
) {
  const payload = await getTypedDataPayload(provider, domain, types, value);

  return JSON.stringify(payload);
}
