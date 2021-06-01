import { randomAddress } from '@enzymefinance/ethers';
import { TestAddressArrayLib } from '@enzymefinance/protocol';

let testAddressArrayLib: TestAddressArrayLib;
beforeAll(async () => {
  testAddressArrayLib = await TestAddressArrayLib.deploy(fork.deployer);
});

describe('mergeArray', () => {
  it('combines only items from a second array that do not exist in the first array', async () => {
    const address1 = randomAddress();
    const address2 = randomAddress();
    const address3 = randomAddress();

    const mergedArray1 = await testAddressArrayLib.mergeArray([], [address1]);
    expect(mergedArray1).toMatchFunctionOutput(testAddressArrayLib.mergeArray, [address1]);

    const mergedArray2 = await testAddressArrayLib.mergeArray(mergedArray1, [address1, address2]);
    expect(mergedArray2).toMatchFunctionOutput(testAddressArrayLib.mergeArray, [...mergedArray1, address2]);

    const mergedArray3 = await testAddressArrayLib.mergeArray(mergedArray2, [address3, address3]);
    expect(mergedArray3).toMatchFunctionOutput(testAddressArrayLib.mergeArray, [...mergedArray2, address3, address3]);

    const mergedArray4 = await testAddressArrayLib.mergeArray(mergedArray3, []);
    expect(mergedArray4).toMatchFunctionOutput(testAddressArrayLib.mergeArray, mergedArray3);
  });
});
