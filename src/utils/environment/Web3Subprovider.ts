import {
  Subprovider,
  JSONRPCRequestPayload,
  ErrorCallback,
  JSONRPCErrorCallback,
} from '@0x/subproviders';

export interface Web3Provider {
  send(payload: JSONRPCRequestPayload, callback: JSONRPCErrorCallback): void;
}

export class Web3Subprovider extends Subprovider {
  private readonly provider: Web3Provider;

  constructor(provider: Web3Provider) {
    super();
    this.provider = provider;
  }

  public async handleRequest(
    payload: JSONRPCRequestPayload,
    _,
    end: ErrorCallback,
  ): Promise<void> {
    this.provider.send(payload, end);
  }
}
