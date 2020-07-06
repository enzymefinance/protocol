import { ethers } from 'ethers';

declare global {
  var ethersProvider: ethers.providers.Provider;
  var ethersSigners: ethers.Signer[];

  namespace jest {
    interface Matchers<R> {
      toHaveBeenCalledOnContract: (method?: string) => object;
      toHaveBeenCalledOnContractTimes: (times: number, method?: string) => object;
    }

    interface Expect {
      toHaveBeenCalledOnContract: (method?: string) => object;
      toHaveBeenCalledOnContractTimes: (times: number, method?: string) => object;
    }
  }
}
