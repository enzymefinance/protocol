// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IGMXV2DataStore} from "../../../../../external-interfaces/IGMXV2DataStore.sol";
import {IGMXV2Market} from "../../../../../external-interfaces/IGMXV2Market.sol";
import {IGMXV2Order} from "../../../../../external-interfaces/IGMXV2Order.sol";
import {IGMXV2Position} from "../../../../../external-interfaces/IGMXV2Position.sol";
import {IGMXV2Reader} from "../../../../../external-interfaces/IGMXV2Reader.sol";

/// @title GMXV2LeverageTradingPositionMixin Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Mixin contract for shared logic in GMXV2 leverage trading position contracts
abstract contract GMXV2LeverageTradingPositionMixin {
    bytes32 internal constant CLAIMABLE_FUNDING_AMOUNT_DATA_STORE_KEY =
        keccak256(abi.encode("CLAIMABLE_FUNDING_AMOUNT"));
    bytes32 internal constant CLAIMED_COLLATERAL_AMOUNT_DATA_STORE_KEY =
        keccak256(abi.encode("CLAIMED_COLLATERAL_AMOUNT"));

    IGMXV2DataStore public immutable DATA_STORE;
    IGMXV2Reader public immutable READER;

    constructor(IGMXV2DataStore _dataStore, IGMXV2Reader _reader) {
        DATA_STORE = _dataStore;
        READER = _reader;
    }

    /// @dev Helper to get claimed collateral amount key
    function __claimedCollateralAmountKey(address _market, address _token, uint256 _timeKey)
        internal
        view
        returns (bytes32 key_)
    {
        return keccak256(
            abi.encode(
                CLAIMED_COLLATERAL_AMOUNT_DATA_STORE_KEY,
                _market,
                _token,
                _timeKey,
                address(this) // account
            )
        );
    }

    function __getAccountOrders() internal view returns (IGMXV2Order.Props[] memory orders_) {
        return READER.getAccountOrders({
            _account: address(this),
            _dataStore: DATA_STORE,
            _start: 0,
            _end: type(uint256).max
        });
    }

    function __getAccountPositions() internal view returns (IGMXV2Position.Props[] memory positions_) {
        return READER.getAccountPositions({
            _account: address(this),
            _dataStore: DATA_STORE,
            _start: 0,
            _end: type(uint256).max
        });
    }

    /// @dev Helper to get claimable funding fees from the data store
    function __getClaimableFundingFees(address _market, address _token)
        internal
        view
        returns (uint256 claimableFundingFees_)
    {
        return DATA_STORE.getUint(
            keccak256(abi.encode(CLAIMABLE_FUNDING_AMOUNT_DATA_STORE_KEY, _market, _token, address(this)))
        );
    }

    /// @dev Helper to get market info from the GMX Reader
    function __getMarketInfo(address _market) internal view returns (IGMXV2Market.Props memory marketInfo_) {
        return READER.getMarket({_dataStore: DATA_STORE, _market: _market});
    }
}
