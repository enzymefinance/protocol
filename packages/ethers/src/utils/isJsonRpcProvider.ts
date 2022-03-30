import { providers } from 'ethers';

export function isJsonRpcProvider(provider: any): provider is providers.JsonRpcProvider {
  return typeof provider?.send === 'function' && providers.Provider.isProvider(provider);
}
