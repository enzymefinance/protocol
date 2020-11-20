// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./../../../release/interfaces/ISynthetixExchangeRates.sol";

contract MockSynthetixExchangeRates is ISynthetixExchangeRates {
    mapping(bytes32 => uint256) public rates;

    constructor() public {}

    function setRate(bytes32 currencyKey, uint256 rate) external {
        rates[currencyKey] = rate;
    }

    function rateAndInvalid(bytes32 currencyKey)
        external
        view
        override
        returns (uint256 rate, bool isInvalid)
    {
        rate = rates[currencyKey];
        isInvalid = (rate == 0);

        return (rate, isInvalid);
    }
}
