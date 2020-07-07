import { ethers, TransactionReceipt } from 'ethers';

declare global {
  namespace jest {
    interface Matchers<R> {
      contractCalled: (method?: string) => object;
      contractCalledTimes: (times: number, method?: string) => object;
      transactionReverts: () => Promise<object>;
      transactionRevertsWith: (search: string) => Promise<object>;
      bigNumberEq: (received: ethers.BigNumberish) => object;
    }

    interface Expect {
      contractCalled: (method?: string) => object;
      contractCalledTimes: (times: number, method?: string) => object;
      transactionReverts: () => Promise<object>;
      transactionRevertsWith: (search: string) => Promise<object>;
      bigNumberEq: (received: ethers.BigNumberish) => object;
    }
  }
}
