/* eslint-disable @typescript-eslint/method-signature-style */
import '@nomiclabs/hardhat-ethers/internal/type-extensions';
import 'hardhat-deploy/dist/src/type-extensions';

import type { AddressLike, CallFunction, SendFunction } from '@enzymefinance/ethers';
import type { BigNumberish, utils } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import type { EthereumTestnetProvider } from './provider';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace globalThis {
    // eslint-disable-next-line no-var
    var hre: HardhatRuntimeEnvironment;
    // eslint-disable-next-line no-var
    var provider: EthereumTestnetProvider;
    // eslint-disable-next-line no-var
    var coverage: boolean;
  }

  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeProperAddress(): R;
      toBeProperPrivateKey(): R;
      toBeProperHex(length: number): R;
      toMatchAddress(expected: AddressLike): R;
      toMatchParams(types: utils.ParamType | utils.ParamType[], expected: any): R;
      toMatchFunctionOutput(
        fragment: CallFunction<any> | SendFunction<any> | utils.FunctionFragment | string,
        expected: any,
      ): R;
      toMatchEventArgs(expected: any): R;
      toBeGtBigNumber(expected: BigNumberish): R;
      toBeLtBigNumber(expected: BigNumberish): R;
      toBeGteBigNumber(expected: BigNumberish): R;
      toBeLteBigNumber(expected: BigNumberish): R;
      toEqBigNumber(expected: BigNumberish): R;
      toBeAroundBigNumber(expected: BigNumberish, tolerance?: BigNumberish): R;
      toBeBetweenBigNumber(min: BigNumberish, max: BigNumberish): R;
      toBeReverted(): R;
      toBeRevertedWith(message: string): R;
      toBeReceipt(): R;
      toCostLessThan(expected: BigNumberish, tolerance?: BigNumberish): R;
      toCostAround(expected: BigNumberish, tolerance?: BigNumberish): R;
      toCostBetween(min: BigNumberish, max: BigNumberish): R;
      toMatchInlineGasSnapshot(expected?: string): R;
      toMatchGasSnapshot(hint?: string): R;
      toHaveEmitted(event: utils.EventFragment | string): R;
      toHaveEmittedWith(event: utils.EventFragment | string, expected: any): R;
      toHaveBeenCalledOnContract(): R;
      toHaveBeenCalledOnContractWith<TArgs extends any[] = []>(...args: TArgs): Promise<R>;
    }
  }
}
