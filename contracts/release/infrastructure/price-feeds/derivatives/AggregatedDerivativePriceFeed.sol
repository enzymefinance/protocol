// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../utils/DispatcherOwnerMixin.sol";
import "./IDerivativePriceFeed.sol";

/// @title AggregatedDerivativePriceFeed Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice An aggregation of several mini derivative price feeds per DeFi service
contract AggregatedDerivativePriceFeed is IDerivativePriceFeed, DispatcherOwnerMixin {
    event PriceFeedSet(address indexed derivative, address prevPriceFeed, address nextPriceFeed);

    mapping(address => address) private derivativeToPriceFeed;

    constructor(
        address _dispatcher,
        address[] memory _derivatives,
        address[] memory _priceFeeds
    ) public DispatcherOwnerMixin(_dispatcher) {
        if (_derivatives.length > 0) {
            __setPriceFeeds(_derivatives, _priceFeeds);
        }
    }

    // EXTERNAL FUNCTIONS

    function getRatesToUnderlyings(address _derivative)
        external
        override
        returns (address[] memory underlyings, uint256[] memory rates)
    {
        address derivativePriceFeed = derivativeToPriceFeed[_derivative];
        require(
            derivativePriceFeed != address(0),
            "getRatesToUnderlyings: price feed does not exist for _derivative"
        );

        return IDerivativePriceFeed(derivativePriceFeed).getRatesToUnderlyings(_derivative);
    }

    /// @dev This should be as low-cost and simple as possible
    function isSupportedAsset(address _asset) external view override returns (bool isSupported_) {
        return derivativeToPriceFeed[_asset] != address(0);
    }

    function setPriceFeeds(address[] calldata _derivatives, address[] calldata _priceFeeds)
        external
        onlyDispatcherOwner
    {
        require(_derivatives.length > 0, "setPriceFeeds: _derivatives cannot be empty");

        __setPriceFeeds(_derivatives, _priceFeeds);
    }

    // PRIVATE FUNCTIONS

    function __setPriceFeeds(address[] memory _derivatives, address[] memory _priceFeeds) private {
        require(
            _derivatives.length == _priceFeeds.length,
            "__setPriceFeeds: unequal _derivatives and _priceFeeds array lengths"
        );

        for (uint256 i = 0; i < _derivatives.length; i++) {
            address prevPriceFeed = derivativeToPriceFeed[_derivatives[i]];
            require(
                prevPriceFeed != _priceFeeds[i],
                "__setPriceFeeds: derivative already has this price feed"
            );

            // TODO: try grabbing a price to confirm that it's a valid price ref?

            derivativeToPriceFeed[_derivatives[i]] = _priceFeeds[i];

            emit PriceFeedSet(_derivatives[i], prevPriceFeed, _priceFeeds[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getPriceFeedForDerivative(address _derivative) external view returns (address) {
        return derivativeToPriceFeed[_derivative];
    }
}
