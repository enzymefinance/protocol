// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IGMXV2Market} from "./IGMXV2Market.sol";
import {IGMXV2Order} from "./IGMXV2Order.sol";
import {IGMXV2Position} from "./IGMXV2Position.sol";

/// @title IGMXV2Reader Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IGMXV2Reader {
    struct OrderInfo {
        bytes32 orderKey;
        IGMXV2Order.Props order;
    }

    function getOrder(address _dataStore, bytes32 _orderKey) external view returns (IGMXV2Order.Props memory order_);

    function getAccountPositions(address _dataStore, address _account, uint256 _start, uint256 _end)
        external
        view
        returns (IGMXV2Position.Props[] memory positions_);

    function getMarket(address _dataStore, address _market) external view returns (IGMXV2Market.Props memory market_);

    function getAccountOrders(address _dataStore, address _account, uint256 _start, uint256 _end)
        external
        view
        returns (OrderInfo[] memory orders_);
}
