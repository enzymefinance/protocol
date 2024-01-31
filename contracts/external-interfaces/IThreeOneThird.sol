// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

/// @title IThreeOneThird Interface
/// @author 31Third <dev@31third.com>, Enzyme Council <security@enzyme.finance>
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

    function batchTrade(Trade[] calldata _trades, BatchTradeConfig memory _batchTradeConfig) external payable;
}
