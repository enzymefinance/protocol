import { ethers, TransactionReceipt } from 'ethers';

declare global {
  namespace jest {
    // TODO: Add more matchers.
    interface Matchers<R> {
      toBeCalledOnContract: (method?: string) => object;
      toBeCalledOnContractTimes: (times: number, method?: string) => object;
      toRevert: () => Promise<object>;
      toRevertWith: (search: string) => Promise<object>;
      toEqualBn: (received: ethers.BigNumberish) => object;
    }
  }
}
