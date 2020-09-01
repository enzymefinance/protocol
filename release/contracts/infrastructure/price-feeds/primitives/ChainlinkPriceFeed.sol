// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@melonproject/persistent/contracts/dispatcher/IDispatcher.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IChainlinkAggregator.sol";
import "./utils/PrimitivePriceFeedBase.sol";

/// @title ChainlinkPriceFeed Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A price feed that uses Chainlink oracles as price sources
contract ChainlinkPriceFeed is PrimitivePriceFeedBase {
    // TODO: should we have functions that don't query for timestamp or care about validity to save on gas?

    using SafeMath for uint256;

    event AggregatorSet(address indexed primitive, address prevAggregator, address nextAggregator);

    // All rates are in ETH, we use WETH as the canonical proxy for ETH
    address private immutable DISPATCHER;
    address private immutable RATE_QUOTE_ASSET;

    mapping(address => address) private primitiveToAggregator;

    constructor(
        address _dispatcher,
        address _rateQuoteAsset,
        address[] memory _primitives,
        address[] memory _aggregators
    ) public {
        __setAggregators(_primitives, _aggregators);
        DISPATCHER = _dispatcher;
        RATE_QUOTE_ASSET = _rateQuoteAsset;
    }

    // EXTERNAL FUNCTIONS

    /// @dev Returns a normalized rate
    function getCanonicalRate(address _baseAsset, address _quoteAsset)
        public
        override
        view
        returns (
            uint256 rate_,
            bool isValid_,
            uint256 timestamp_
        )
    {
        if (_baseAsset == _quoteAsset) {
            return (10**RATE_PRECISION, true, now);
        }

        // TODO: Chainlink might soon have an option to use uint instead of int
        (int256 baseAssetRate, uint256 baseAssetPriceTimestamp) = __getLatestPriceData(_baseAsset);
        if (baseAssetRate <= 0) {
            return (0, false, 0);
        }
        uint256 ethPerBaseAsset = uint256(baseAssetRate);

        (int256 quoteAssetRate, uint256 quoteAssetPriceTimestamp) = __getLatestPriceData(
            _quoteAsset
        );
        if (quoteAssetRate <= 0) {
            return (0, false, 0);
        }
        uint256 ethPerQuoteAsset = uint256(baseAssetRate);

        // TODO: confirm this is normalized when both assets have odd decimal values
        rate_ = ethPerBaseAsset.mul(10**RATE_PRECISION).div(ethPerQuoteAsset);
        isValid_ = true;

        // Use the earlier timestamp for the return value
        if (baseAssetPriceTimestamp > quoteAssetPriceTimestamp) {
            timestamp_ = quoteAssetPriceTimestamp;
        } else {
            timestamp_ = baseAssetPriceTimestamp;
        }
    }

    function getLiveRate(address _baseAsset, address _quoteAsset)
        external
        override
        view
        returns (uint256 rate_, bool isValid_)
    {
        (rate_, isValid_, ) = getCanonicalRate(_baseAsset, _quoteAsset);
    }

    /// @dev This should be as low-cost and simple as possible
    function isSupportedAsset(address _asset) external override view returns (bool isSupported_) {
        return _asset == RATE_QUOTE_ASSET || primitiveToAggregator[_asset] != address(0);
    }

    function setAggregators(address[] calldata _primitives, address[] calldata _aggregators)
        external
    {
        require(
            msg.sender == IDispatcher(DISPATCHER).getMTC(),
            "setAggregators: Only MTC can call this function"
        );
        __setAggregators(_primitives, _aggregators);
    }

    // PRIVATE FUNCTIONS

    function __getLatestPriceData(address _asset)
        private
        view
        returns (int256 rate_, uint256 timestamp_)
    {
        if (_asset == RATE_QUOTE_ASSET) {
            return (int256(10**RATE_PRECISION), now);
        }

        // TODO: return or revert for unavailable asset rates?
        address aggregator = primitiveToAggregator[_asset];
        if (aggregator == address(0)) {
            return (0, 0);
        }

        IChainlinkAggregator aggregatorContract = IChainlinkAggregator(aggregator);
        rate_ = aggregatorContract.latestAnswer();
        timestamp_ = aggregatorContract.latestTimestamp();
    }

    function __setAggregators(address[] memory _primitives, address[] memory _aggregators)
        private
    {
        require(_primitives.length > 0, "__setAggregators: _primitives cannot be empty");
        require(
            _primitives.length == _aggregators.length,
            "__setAggregators: unequal _primitives and _aggregators array lengths"
        );

        for (uint256 i = 0; i < _primitives.length; i++) {
            address prevAggregator = primitiveToAggregator[_primitives[i]];
            require(
                prevAggregator != _aggregators[i],
                "__setAggregators: primitive already has this aggregator"
            );

            // TODO: try grabbing a price to confirm that it's a valid price ref?

            primitiveToAggregator[_primitives[i]] = _aggregators[i];

            emit AggregatorSet(_primitives[i], prevAggregator, _aggregators[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getAggregatorForPrimitive(address _primitive)
        external
        view
        returns (address aggregator_)
    {
        return primitiveToAggregator[_primitive];
    }

    function getDispatcher() external view returns (address dispatcher_) {
        return DISPATCHER;
    }

    function getRateQuoteAsset() external view returns (address rateQuoteAsset_) {
        return RATE_QUOTE_ASSET;
    }
}
