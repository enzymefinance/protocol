// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

contract MockChainlinkPriceSource {
    int256 public latestAnswer;
    uint256 public latestTimestamp;

    constructor() public {
        latestAnswer = 1 ether;
        latestTimestamp = now;
    }

    function setLatestAnswer(int256 _nextAnswer) external {
        latestAnswer = _nextAnswer;
    }

    function setLatestTimestamp(uint256 _nextTimestamp) external {
        latestTimestamp = _nextTimestamp;
    }
}
