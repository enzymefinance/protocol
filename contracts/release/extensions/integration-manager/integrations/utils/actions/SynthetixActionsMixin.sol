// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../infrastructure/price-feeds/derivatives/feeds/SynthetixPriceFeed.sol";
import "../../../../../interfaces/ISynthetix.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title SynthetixActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Synthetix exchange functions
abstract contract SynthetixActionsMixin is AssetHelpers {
    address private immutable SYNTHETIX;
    address private immutable SYNTHETIX_ORIGINATOR;
    address private immutable SYNTHETIX_PRICE_FEED;
    bytes32 private immutable SYNTHETIX_TRACKING_CODE;

    constructor(
        address _priceFeed,
        address _originator,
        address _synthetix,
        bytes32 _trackingCode
    ) public {
        SYNTHETIX_PRICE_FEED = _priceFeed;
        SYNTHETIX_ORIGINATOR = _originator;
        SYNTHETIX = _synthetix;
        SYNTHETIX_TRACKING_CODE = _trackingCode;
    }

    /// @dev Helper to execute takeOrder
    function __synthetixTakeOrder(
        address _recipient,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        address _incomingAsset
    ) internal {
        address[] memory synths = new address[](2);
        synths[0] = _outgoingAsset;
        synths[1] = _incomingAsset;

        bytes32[] memory currencyKeys = SynthetixPriceFeed(SYNTHETIX_PRICE_FEED)
            .getCurrencyKeysForSynths(synths);

        ISynthetix(SYNTHETIX).exchangeOnBehalfWithTracking(
            _recipient,
            currencyKeys[0],
            _outgoingAssetAmount,
            currencyKeys[1],
            SYNTHETIX_ORIGINATOR,
            SYNTHETIX_TRACKING_CODE
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `SYNTHETIX` variable
    /// @return synthetix_ The `SYNTHETIX` variable value
    function getSynthetix() public view returns (address synthetix_) {
        return SYNTHETIX;
    }

    /// @notice Gets the `SYNTHETIX_ORIGINATOR` variable
    /// @return synthetixOriginator_ The `SYNTHETIX_ORIGINATOR` variable value
    function getSynthetixOriginator() public view returns (address synthetixOriginator_) {
        return SYNTHETIX_ORIGINATOR;
    }

    /// @notice Gets the `SYNTHETIX_PRICE_FEED` variable
    /// @return synthetixPriceFeed_ The `SYNTHETIX_PRICE_FEED` variable value
    function getSynthetixPriceFeed() public view returns (address synthetixPriceFeed_) {
        return SYNTHETIX_PRICE_FEED;
    }

    /// @notice Gets the `SYNTHETIX_TRACKING_CODE` variable
    /// @return synthetixTrackingCode_ The `SYNTHETIX_TRACKING_CODE` variable value
    function getSynthetixTrackingCode() public view returns (bytes32 synthetixTrackingCode_) {
        return SYNTHETIX_TRACKING_CODE;
    }
}
