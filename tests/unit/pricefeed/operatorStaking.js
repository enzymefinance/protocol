import test from "ava";
import api from "../../../utils/lib/api";
import deployEnvironment from "../../../utils/deploy/contracts";
import {deployContract} from "../../../utils/lib/contracts";
import {mineToTime, txidToTimestamp} from "../../../utils/lib/time";

const BigNumber = require("bignumber.js");

const environment = "development";

// hoisted variables
let deployer;
let stakers;

// constants
const initialMln = new BigNumber(10 ** 20);
const minimumStake = new BigNumber(1000);

// helpers
function shuffle(array) { // TODO: iterate stakers randomly (further below)
  array.sort(() => .5 - Math.random());
}

test.before(async () => {
  const accounts = await api.eth.accounts();
  [deployer, ...stakers] = accounts;
});

test.beforeEach(async t => {
  const deployed = await deployEnvironment(environment);
  t.context.mlnToken = deployed.MlnToken;
  await Promise.all(stakers.map(async staker => {
    await t.context.mlnToken.instance.transfer.postTransaction(
      {from: deployer}, [staker, initialMln, ""]
    );
  }));
  t.context.staking = await deployContract(
    "system/OperatorStaking",
    {from: deployer, gas: 6000000},
    [
      t.context.mlnToken.address,    // staking token
      minimumStake,
      4,                             // number of operators
      0
    ]
  );
});

test("staker cannot stake below minimum", async t => {
  await t.context.mlnToken.instance.approve.postTransaction(
    {from: stakers[0]}, [t.context.staking.address, minimumStake.minus(1)]
  );
  await t.context.staking.instance.stake.postTransaction(
    {from: stakers[0]}, [minimumStake.minus(1), ""]
  );
  const totalStake = await t.context.staking.instance.totalStakedFor.call(
    {}, [stakers[0]]
  );
  const isOperator = await t.context.staking.instance.isOperator.call(
    {}, [stakers[0]]
  );

  t.is(Number(totalStake), 0);
  t.false(isOperator);
});

test("staker approves, stakes, and is tracked in contract", async t => {
  const preStakerMln = await t.context.mlnToken.instance.balanceOf.call(
    {}, [stakers[0]]
  );
  const preContractMln = await t.context.mlnToken.instance.balanceOf.call(
    {}, [t.context.staking.address]
  );
  await t.context.mlnToken.instance.approve.postTransaction(
    {from: stakers[0]}, [t.context.staking.address, minimumStake]
  );
  await t.context.staking.instance.stake.postTransaction(
    {from: stakers[0]}, [minimumStake, ""]
  );
  const totalStake = await t.context.staking.instance.totalStakedFor.call(
    {}, [stakers[0]]
  );
  const isOperator = await t.context.staking.instance.isOperator.call(
    {}, [stakers[0]]
  );
  const operators = await t.context.staking.instance.getOperators.call()
  const postStakerMln = await t.context.mlnToken.instance.balanceOf.call(
    {}, [stakers[0]]
  );
  const postContractMln = await t.context.mlnToken.instance.balanceOf.call(
    {}, [t.context.staking.address]
  );

  t.is(Number(totalStake), Number(minimumStake));
  t.true(isOperator);
  t.is(operators[0]._value, stakers[0]);
  t.is(Number(postContractMln.minus(preContractMln)), Number(minimumStake));
  t.is(Number(preStakerMln.minus(postStakerMln)), Number(minimumStake));
});

test("staker unstakes fully, and is no longer an operator", async t => {
  const preStakerMln = await t.context.mlnToken.instance.balanceOf.call(
    {}, [stakers[0]]
  );
  const preContractMln = await t.context.mlnToken.instance.balanceOf.call(
    {}, [t.context.staking.address]
  );
  await t.context.mlnToken.instance.approve.postTransaction(
    {from: stakers[0]}, [t.context.staking.address, minimumStake]
  );
  await t.context.staking.instance.stake.postTransaction(
    {from: stakers[0]}, [minimumStake, ""]
  );
  const preTotalStake = await t.context.staking.instance.totalStakedFor.call(
    {}, [stakers[0]]
  );
  const preIsOperator = await t.context.staking.instance.isOperator.call(
    {}, [stakers[0]]
  );
  const preIsRanked = await t.context.staking.instance.isRanked.call(
    {}, [stakers[0]]
  );

  t.is(Number(preTotalStake), Number(minimumStake));
  t.true(preIsOperator);
  t.true(preIsRanked);

  await t.context.staking.instance.unstake.postTransaction(
    {from: stakers[0]}, [minimumStake, ""]
  );
 
  const postStakerMln = await t.context.mlnToken.instance.balanceOf.call(
    {}, [stakers[0]]
  );
  const postContractMln = await t.context.mlnToken.instance.balanceOf.call(
    {}, [t.context.staking.address]
  );
  const postTotalStake = await t.context.staking.instance.totalStakedFor.call(
    {}, [stakers[0]]
  );
  const postIsOperator = await t.context.staking.instance.isOperator.call(
    {}, [stakers[0]]
  );
  const postIsRanked = await t.context.staking.instance.isRanked.call(
    {}, [stakers[0]]
  );

  t.is(Number(preStakerMln), Number(postStakerMln));
  t.is(Number(preContractMln), Number(postContractMln));
  t.is(Number(postTotalStake), 0);
  t.false(postIsOperator);
  t.false(postIsRanked);
});

test("unstake fails before delay complete", async t => {
  const inputGas = 6000000;
  const unstakeDelay = 7;
  t.context.staking = await deployContract(
    "system/OperatorStaking",
    {from: deployer, gas: 6000000},
    [
      t.context.mlnToken.address,    // staking token
      minimumStake,
      4,                             // number of operators
      unstakeDelay
    ]
  );
  await t.context.mlnToken.instance.approve.postTransaction(
    {from: stakers[0]}, [t.context.staking.address, minimumStake]
  );
  let txid = await t.context.staking.instance.stake.postTransaction(
    {from: stakers[0]}, [minimumStake, ""]
  );
  const initialStakeTime = await txidToTimestamp(txid);
  const stakedAmount = await t.context.staking.instance.totalStakedFor.call(
    {}, [stakers[0]]
  );

  t.is(Number(stakedAmount), Number(minimumStake));

  txid = await t.context.staking.instance.unstake.postTransaction(
    {from: stakers[0], gas: inputGas}, [minimumStake, ""]
  );
  const failedUnstakeGas = (await api.eth.getTransactionReceipt(txid)).gasUsed;
  const failedUnstakeTime = await txidToTimestamp(txid);

  t.true(initialStakeTime + unstakeDelay > failedUnstakeTime); // delay not reached
  t.is(Number(failedUnstakeGas), inputGas);

  await mineToTime(initialStakeTime + unstakeDelay); // pass delay

  txid = await t.context.staking.instance.unstake.postTransaction(
    {from: stakers[0], gas: inputGas}, [minimumStake, ""]
  );
  const unstakeGas = (await api.eth.getTransactionReceipt(txid)).gasUsed;
  const postUnstakeStakedAmount = await t.context.staking.instance.totalStakedFor.call(
    {}, [stakers[0]]
  );
  const unstakeTime = await txidToTimestamp(txid);

  t.true(unstakeTime > initialStakeTime + unstakeDelay);  // delay was indeed passed
  t.true(Number(unstakeGas) < inputGas);
  t.is(Number(postUnstakeStakedAmount), 0);
});

test("ranking is correct with multiple stakers", async t => {
  // "amounts": amount used by $action
  // "final": expected staked amount after applying $action
  // "order": order of stakers output after applying $action (from least to most staked)
  const scenario = [
    {
      action:  'stake',
      amounts: [ 20000, 19000, 18000, 15000, 14000 ],
      final:   [ 20000, 19000, 18000, 15000, 14000 ],
      order:   [ 4, 3, 2, 1, 0 ]
    }, {
      action:  'unstake',
      amounts: [ 10000, 19000, 0,      5000, 9000  ],
      final:   [ 10000, 0,     18000, 10000, 5000  ],
      order:   [ 4, 0, 3, 2 ]
    }, {
      action:  'stake',
      amounts: [ 0,     30000, 1000,   5000, 20000 ],
      final:   [ 10000, 30000, 19000, 15000, 25000  ],
      order:   [ 0, 3, 2, 4, 1 ]
    }
  ];

  for (const [iStep, step] of scenario.entries()) {
    for (const [iStaker, staker] of stakers.entries()) {
      if (step.amounts[iStaker] !== 0) { // TODO: iterate stakers randomly
        if (step.action === 'stake') {
          await t.context.mlnToken.instance.approve.postTransaction(
            {from: staker, gas: 6000000}, [t.context.staking.address, 0]
          );
          await t.context.mlnToken.instance.approve.postTransaction(
            {from: staker, gas: 6000000},
            [t.context.staking.address, step.amounts[iStaker]]
          );
          await t.context.staking.instance.stake.postTransaction(
            {from: staker, gas: 6000000}, [step.amounts[iStaker], ""]
          );
        } else if (step.action === 'unstake') {
          await t.context.staking.instance.unstake.postTransaction(
            {from: staker, gas: 6000000}, [step.amounts[iStaker], ""]
          );
        }
      }
      const total = await t.context.staking.instance.totalStakedFor.call(
        {}, [staker]
      );
 
      t.is(Number(total), step.final[iStaker]);
    };
    const [rawStakers, rawAmounts] = await t.context.staking.instance.getStakersAndAmounts.call();
    const outStakers = rawStakers.map(e => e._value);
    const outAmounts = rawAmounts.map(e => Number(e._value));
    const sortedFinal = step.order.map(item => step.final[item]);
    const sortedStakers = step.order.map(item => stakers[item]);

    for (let i = 0; i < sortedStakers.length; i++) {
      const currentOperator = sortedStakers[sortedStakers.length - (i+1)];
      const isOperator = await t.context.staking.instance.isOperator.call({}, [currentOperator]);
      if (i < 4) { // only top 4 stakers should be operator (max defined at contract deploy)
        t.true(isOperator);
      } else {
        t.false(isOperator);
      }
    }

    t.is(outAmounts.join(', '), sortedFinal.join(', '));
    t.is(outStakers.join(', '), sortedStakers.join(', '));
  };
});

test("worst-case sorting/insertion is possible at max number of stakers", async t => {
  const inputGas = 6900000;
  // const maxStakers = Number(await t.context.staking.instance.MAX_STAKERS.call());
  const maxStakers = 10;
  const allGasUsage = [];
  for (let i = 0; i < maxStakers; i++) {    // stake max number of addresses
    const stakeThisRound = minimumStake.times(100000000000000).minus(1000 * i);
    const addressThisRound = `0x${i.toString(16).padStart(40, "0")}`;
    await t.context.mlnToken.instance.approve.postTransaction(
      {from: stakers[0]}, [t.context.staking.address, stakeThisRound]
    );
    const txid = await t.context.staking.instance.stakeFor.postTransaction(
      {from: stakers[0], gas: inputGas}, [addressThisRound, stakeThisRound, ""]
    );
    allGasUsage.push(Number(await api.eth.getTransactionReceipt(txid)).gasUsed);
  }

  t.true(allGasUsage.indexOf(inputGas) == -1); // none of the staking tx failed
});
