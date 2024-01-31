// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

interface IThreeOneThird {
    struct Trade {
        string exchangeName;
        address from;
        uint256 fromAmount;
        address to;
        uint256 minToReceiveBeforeFees;
        bytes data;
        bytes signature;
    }

    struct BatchTradeConfig {
        bool checkFeelessWallets;
        bool revertOnError;
    }

    function feeBasisPoints() external view returns (uint16);

    function updateTradeSigner(address _newTradeSigner) external;
}
