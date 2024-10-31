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
import {IGMXV2DataStore} from "./IGMXV2DataStore.sol";

/// @title IGMXV2Reader Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IGMXV2Reader {
    function getOrder(IGMXV2DataStore _dataStore, bytes32 _orderKey)
        external
        view
        returns (IGMXV2Order.Props memory order_);

    function getAccountPositions(IGMXV2DataStore _dataStore, address _account, uint256 _start, uint256 _end)
        external
        view
        returns (IGMXV2Position.Props[] memory positions_);

    function getMarket(IGMXV2DataStore _dataStore, address _market)
        external
        view
        returns (IGMXV2Market.Props memory market_);

    function getAccountOrders(IGMXV2DataStore _dataStore, address _account, uint256 _start, uint256 _end)
        external
        view
        returns (IGMXV2Order.Props[] memory orders_);

    function getAccountPositionInfoList(
        IGMXV2DataStore _dataStore,
        address _referralStorage,
        address _account,
        address[] memory _markets,
        IGMXV2Market.MarketPrices[] memory _prices,
        address _uiFeeReceiver,
        uint256 _start,
        uint256 _end
    ) external view returns (IGMXV2Position.PositionInfo[] memory positionInfos_);
}
