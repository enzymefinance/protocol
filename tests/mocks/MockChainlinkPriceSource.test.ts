import { utils } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { MockChainlinkPriceSource } from '@melonproject/protocol';
import { assertEvent } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const signer = await provider.getSignerWithAddress(1);
  const chainlinkPriceSource = await MockChainlinkPriceSource.deploy(signer, 18);

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
  const latestBlock = await provider.getBlock('latest');
  const receipt = await chainlinkPriceSource.setLatestAnswer.args(nextAnswer, latestBlock.timestamp).send();

  assertEvent(receipt, 'AnswerUpdated');

  const latestAnswer = await chainlinkPriceSource.latestAnswer();
  expect(latestAnswer).toEqBigNumber(nextAnswer);

  const roundId = await chainlinkPriceSource.roundId();
  expect(roundId).toEqBigNumber('2');

  const latestTimestamp = await chainlinkPriceSource.latestTimestamp();
  expect(latestTimestamp).toEqBigNumber(latestBlock.timestamp);
});
