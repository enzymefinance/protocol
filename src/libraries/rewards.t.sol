pragma solidity ^0.4.17;

import "ds-test/test.sol";
import "./rewards.sol";

contract rewardsTest is DSTest {
    uint mockGav = 5000000;
    uint totalSupply = 10000;
    uint performanceRate = 10 ** 13; // 1% of performance
    uint managementRate = 38580247; // 10% every 30 days
    uint divisor = 10 ** 15;
    uint secondsInMonth = 60 * 60 * 24 * 30;  // 30 days

    // function testZeroRewardRates() {
    //     int mockPriceDelta = 500;
    //     uint managementReward = rewards.managementReward(0, secondsInMonth, mockGav, divisor);
    //     uint performanceReward = rewards.performanceReward(0, mockPriceDelta, totalSupply, divisor);

    //     assertEq(managementReward, 0);
    //     assertEq(performanceReward, 0);
    // }

    // function testManagementReward() {
    //     uint expectedMonthlyReward = mockGav / 10;  // expect 10% of GAV after one month
    //     uint oneMonthReward = rewards.managementReward(managementRate, secondsInMonth, mockGav, divisor);
    //     uint twoMonthReward = rewards.managementReward(managementRate, secondsInMonth * 2, mockGav, divisor);
    //     uint threeMonthReward = rewards.managementReward(managementRate, secondsInMonth * 3, mockGav, divisor);
    //     uint sevenMonthReward = rewards.managementReward(managementRate, secondsInMonth * 7, mockGav, divisor);

    //     assertEq(oneMonthReward, expectedMonthlyReward);
    //     assertEq(twoMonthReward, expectedMonthlyReward * 2);
    //     assertEq(threeMonthReward, expectedMonthlyReward * 3);
    //     assertEq(sevenMonthReward, expectedMonthlyReward * 7);
    // }

    // function testPerformanceReward() {
    //     int deltaPrice1 = 500;
    //     uint expectedReward1 = uint(deltaPrice1) / 100 * totalSupply;
    //     int deltaPrice2 = -1000;
    //     uint expectedReward2 = 0;
    //     int deltaPrice3 = 0;
    //     uint expectedReward3 = 0;
    //     int deltaPrice4 = 1450000;
    //     uint expectedReward4 = uint(deltaPrice4) / 100 * totalSupply;
    //     uint reward1 = rewards.performanceReward(performanceRate, deltaPrice1, totalSupply, divisor);
    //     uint reward2 = rewards.performanceReward(performanceRate, deltaPrice2, totalSupply, divisor);
    //     uint reward3 = rewards.performanceReward(performanceRate, deltaPrice3, totalSupply, divisor);
    //     uint reward4 = rewards.performanceReward(performanceRate, deltaPrice4, totalSupply, divisor);

    //     assertEq(reward1, expectedReward1);
    //     assertEq(reward2, expectedReward2);
    //     assertEq(reward3, expectedReward3);
    //     assertEq(reward4, expectedReward4);
    // }
}
