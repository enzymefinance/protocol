import ganache from 'ganache-core';
import { ethers } from 'ethers';

export interface Message {
  to: Buffer;
  data: Buffer;
}

export class CallHistory {
  private readonly history = new Map<string, string[]>();

  constructor(public readonly provider: ganache.Provider) {
    const state = (provider as any)?.manager?.state;
    const create = state.blockchain.createVMFromStateTrie.bind(
      state.blockchain,
    );

    state.blockchain.createVMFromStateTrie = (...args: any[]) => {
      const vm = create(...args);
      vm.on('beforeMessage', this.record.bind(this));

      return vm;
    };
  }

  public clear() {
    this.history.clear();
  }

  public reset(address: string) {
    const addr = ethers.utils.getAddress(address);
    return this.history.delete(addr);
  }

  public calls(address: string) {
    return this.history.get(address) ?? [];
  }

  public record(message: Message) {
    if (!message.to) {
      return;
    }

    const to = ethers.utils.getAddress(ethers.utils.hexlify(message.to));
    const data = message.data ? ethers.utils.hexlify(message.data) : '0x';

    this.history.set(to, this.calls(to).concat(data));
  }
}
