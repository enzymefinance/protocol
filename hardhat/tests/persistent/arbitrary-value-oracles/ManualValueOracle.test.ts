import { randomAddress } from '@enzymefinance/ethers';
import type { ManualValueOracleFactory, ManualValueOracleLib } from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertNoEvent,
  deployManualValueOracle,
  deployProtocolFixture,
  transactionTimestamp,
} from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

const randomAddress1 = randomAddress();
let manualValueOracleFactory: ManualValueOracleFactory;
let owner: SignerWithAddress, randomUser: SignerWithAddress, signer: SignerWithAddress, updater: SignerWithAddress;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [signer, owner, updater, randomUser] = fork.accounts;

  manualValueOracleFactory = fork.deployment.manualValueOracleFactory;
});

describe('factory: deploy', () => {
  it('happy path', async () => {
    const { proxy: oracle, receipt } = await deployManualValueOracle({
      signer,
      manualValueOracleFactory,
      owner,
      updater,
    });

    // Assert proxy state
    expect(await oracle.getOwner()).toMatchAddress(owner);
    expect(await oracle.getUpdater()).toMatchAddress(updater);
    expect(await oracle.getValue()).toEqBigNumber(0);
    expect(await oracle.getLastUpdated()).toEqBigNumber(0);
    expect(await oracle.getValueWithTimestamp()).toMatchFunctionOutput(oracle.getValueWithTimestamp, {
      value_: 0,
      lastUpdated_: 0,
    });

    // Assert event
    assertEvent(receipt, 'ProxyDeployed', {
      caller: signer,
      proxy: oracle,
    });

    expect(receipt).toMatchInlineGasSnapshot(`157438`);
  });
});

describe('init', () => {
  const description = 'test';

  it('does not allow an already-initialized proxy', async () => {
    const { proxy: oracle } = await deployManualValueOracle({
      signer,
      manualValueOracleFactory,
      owner,
      updater,
      description,
    });

    // Should fail since already initialized upon deployment
    await expect(oracle.connect(owner).init(owner, updater, constants.HashZero)).rejects.toBeRevertedWith(
      'Already initialized',
    );
  });

  it('does not allow an empty owner', async () => {
    await expect(
      deployManualValueOracle({
        signer,
        manualValueOracleFactory,
        owner: constants.AddressZero,
        updater,
        description,
      }),
    ).rejects.toBeRevertedWith('Empty _owner');
  });

  it('happy path: with updater', async () => {
    const { proxy: oracle, receipt } = await deployManualValueOracle({
      signer,
      manualValueOracleFactory,
      owner,
      updater,
      description,
    });

    // Owner and updater should be set
    expect(await oracle.getOwner()).toMatchAddress(owner);
    expect(await oracle.getUpdater()).toMatchAddress(updater);

    // Value and timestamp being their defaults is already tested in factory test

    // Assert events
    assertEvent(receipt, oracle.abi.getEvent('Initialized'), {
      description: utils.formatBytes32String(description),
    });
    assertEvent(receipt, oracle.abi.getEvent('UpdaterSet'), {
      updater,
    });

    // Gas cost tested in factory
  });

  it('happy path: no updater', async () => {
    const { proxy: oracle, receipt } = await deployManualValueOracle({
      signer,
      manualValueOracleFactory,
      owner,
      updater: constants.AddressZero,
    });

    // Owner should be set
    expect(await oracle.getOwner()).toMatchAddress(owner);

    // Assert non event
    assertNoEvent(receipt, oracle.abi.getEvent('UpdaterSet'));
  });
});

describe('setUpdater', () => {
  const nextUpdater = randomAddress1;
  let oracle: ManualValueOracleLib;

  beforeEach(async () => {
    const deployOracleRes = await deployManualValueOracle({
      signer,
      manualValueOracleFactory,
      owner,
      updater,
    });
    oracle = deployOracleRes.proxy;
  });

  it('cannot be called by a random user', async () => {
    await expect(oracle.connect(randomUser).setUpdater(nextUpdater)).rejects.toBeRevertedWith('Unauthorized');
  });

  it('works as expected', async () => {
    const receipt = await oracle.connect(owner).setUpdater(nextUpdater);

    // Assert state
    expect(await oracle.getUpdater()).toMatchAddress(nextUpdater);

    // Assert event
    assertEvent(receipt, oracle.abi.getEvent('UpdaterSet'), {
      updater: nextUpdater,
    });

    expect(receipt).toMatchInlineGasSnapshot(`32761`);
  });
});

describe('updateValue', () => {
  const nextValue = 123;
  let oracle: ManualValueOracleLib;

  beforeEach(async () => {
    const deployOracleRes = await deployManualValueOracle({
      signer,
      manualValueOracleFactory,
      owner,
      updater,
    });
    oracle = deployOracleRes.proxy;
  });

  it('cannot be called by a random user', async () => {
    await expect(oracle.connect(randomUser).updateValue(nextValue)).rejects.toBeRevertedWith('Unauthorized');
  });

  it('works as expected', async () => {
    const receipt = await oracle.connect(updater).updateValue(nextValue);

    const lastUpdated = await transactionTimestamp(receipt);

    // Assert state
    expect(await oracle.getValue()).toEqBigNumber(nextValue);
    expect(await oracle.getLastUpdated()).toEqBigNumber(lastUpdated);
    expect(await oracle.getValueWithTimestamp()).toMatchFunctionOutput(oracle.getValueWithTimestamp, {
      value_: nextValue,
      lastUpdated_: lastUpdated,
    });

    // Assert event
    assertEvent(receipt, oracle.abi.getEvent('ValueUpdated'), {
      value: nextValue,
    });

    expect(receipt).toMatchInlineGasSnapshot(`49599`);
  });
});
