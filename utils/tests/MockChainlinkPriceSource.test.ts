import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { utils } from 'ethers';
import { assertEvent } from '../utils/testing';
import { MockChainlinkPriceSource } from '../utils/contracts';

async function snapshot(provider: EthereumTestnetProvider) {
  const [deployer] = await provider.listAccounts();
  const signer = provider.getSigner(deployer);
  const chainlinkPriceSource = await MockChainlinkPriceSource.deploy(
    signer,
    18,
  );

  return chainlinkPriceSource;
}

it('sets initial state', async () => {
  const chainlinkPriceSource = await provider.snapshot(snapshot);

  const latestAnswer = await chainlinkPriceSource.latestAnswer();
  expect(latestAnswer).toEqBigNumber(utils.parseEther('1'));

  const roundId = await chainlinkPriceSource.roundId();
  expect(roundId).toEqBigNumber('1');
});

it('is updated correctly', async () => {
  const chainlinkPriceSource = await provider.snapshot(snapshot);

  const nextAnswer = utils.parseEther('2');
  const nextTimestamp = Math.round(Date.now() / 1000);

  const tx = chainlinkPriceSource.setLatestAnswer
    .args(nextAnswer, nextTimestamp)
    .send();

  await assertEvent(tx, 'AnswerUpdated');

  const latestAnswer = await chainlinkPriceSource.latestAnswer();
  expect(latestAnswer).toEqBigNumber(nextAnswer);

  const roundId = await chainlinkPriceSource.roundId();
  expect(roundId).toEqBigNumber('2');

  const latestTimestamp = await chainlinkPriceSource.latestTimestamp();
  expect(latestTimestamp).toEqBigNumber(nextTimestamp);
});
