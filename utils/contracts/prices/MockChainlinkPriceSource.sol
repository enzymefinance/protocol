// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

contract MockChainlinkPriceSource {
    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 timestamp);

    int256 public latestAnswer;
    uint256 public latestTimestamp;
    uint256 public roundId;

    constructor() public {
        latestAnswer = 1 ether;
        latestTimestamp = now;
        roundId = 1;
    }

    function setLatestAnswer(int256 _nextAnswer, uint256 _nextTimestamp) external {
        latestAnswer = _nextAnswer;
        latestTimestamp = _nextTimestamp;
        roundId = roundId + 1;

        emit AnswerUpdated(latestAnswer, roundId, latestTimestamp);
    }
}
