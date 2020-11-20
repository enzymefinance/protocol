// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./../../interfaces/ISynthetixDelegateApprovals.sol";

contract MockSynthetixDelegateApprovals is ISynthetixDelegateApprovals {
    mapping(address => mapping(address => bool)) public delegatedByAuthoriser;

    constructor() public {}

    function approveExchangeOnBehalf(address delegate) external override {
        delegatedByAuthoriser[msg.sender][delegate] = true;
    }

    function canExchangeFor(address authoriser, address delegate)
        external
        view
        override
        returns (bool)
    {
        return delegatedByAuthoriser[authoriser][delegate];
    }
}
