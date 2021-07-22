// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../interfaces/IChainlinkAggregator.sol";

/// @title ChainlinkPriceFeedMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A price feed that uses Chainlink oracles as price sources
abstract contract ChainlinkPriceFeedMixin {
    using SafeMath for uint256;

    event EthUsdAggregatorSet(address prevEthUsdAggregator, address nextEthUsdAggregator);

    event PrimitiveAdded(
        address indexed primitive,
        address aggregator,
        RateAsset rateAsset,
        uint256 unit
    );

    event PrimitiveRemoved(address indexed primitive);

    event StalePrimitiveRemoved(address indexed primitive);

    event StaleRateThresholdSet(uint256 prevStaleRateThreshold, uint256 nextStaleRateThreshold);

    enum RateAsset {ETH, USD}

    struct AggregatorInfo {
        address aggregator;
        RateAsset rateAsset;
    }

    uint256 private constant ETH_UNIT = 10**18;
    address private immutable WETH_TOKEN;

    address private ethUsdAggregator;
    uint256 private staleRateThreshold;
    mapping(address => AggregatorInfo) private primitiveToAggregatorInfo;
    mapping(address => uint256) private primitiveToUnit;

    constructor(address _wethToken) public {
        WETH_TOKEN = _wethToken;
        staleRateThreshold = 25 hours; // 24 hour heartbeat + 1hr buffer
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether the current rate is considered stale for the specified aggregator
    /// @param _aggregator The Chainlink aggregator of which to check staleness
    /// @return rateIsStale_ True if the rate is considered stale
    function rateIsStale(address _aggregator) public view returns (bool rateIsStale_) {
        return
            IChainlinkAggregator(_aggregator).latestTimestamp() <
            block.timestamp.sub(staleRateThreshold);
    }

    // INTERNAL FUNCTIONS

    /// @notice Calculates the value of a base asset in terms of a quote asset (using a canonical rate)
    /// @param _baseAsset The base asset
    /// @param _baseAssetAmount The base asset amount to convert
    /// @param _quoteAsset The quote asset
    /// @return quoteAssetAmount_ The equivalent quote asset amount
    function __calcCanonicalValue(
        address _baseAsset,
        uint256 _baseAssetAmount,
        address _quoteAsset
    ) internal view returns (uint256 quoteAssetAmount_) {
        // Case where _baseAsset == _quoteAsset is handled by ValueInterpreter

        int256 baseAssetRate = __getLatestRateData(_baseAsset);
        require(baseAssetRate > 0, "calcCanonicalValue: Invalid base asset rate");

        int256 quoteAssetRate = __getLatestRateData(_quoteAsset);
        require(quoteAssetRate > 0, "calcCanonicalValue: Invalid quote asset rate");

        return
            __calcConversionAmount(
                _baseAsset,
                _baseAssetAmount,
                uint256(baseAssetRate),
                _quoteAsset,
                uint256(quoteAssetRate)
            );
    }

    /// @dev Helper to set the `ethUsdAggregator` value
    function __setEthUsdAggregator(address _nextEthUsdAggregator) internal {
        address prevEthUsdAggregator = ethUsdAggregator;
        require(
            _nextEthUsdAggregator != prevEthUsdAggregator,
            "__setEthUsdAggregator: Value already set"
        );

        __validateAggregator(_nextEthUsdAggregator);

        ethUsdAggregator = _nextEthUsdAggregator;

        emit EthUsdAggregatorSet(prevEthUsdAggregator, _nextEthUsdAggregator);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to convert an amount from a _baseAsset to a _quoteAsset
    function __calcConversionAmount(
        address _baseAsset,
        uint256 _baseAssetAmount,
        uint256 _baseAssetRate,
        address _quoteAsset,
        uint256 _quoteAssetRate
    ) private view returns (uint256 quoteAssetAmount_) {
        RateAsset baseAssetRateAsset = getRateAssetForPrimitive(_baseAsset);
        RateAsset quoteAssetRateAsset = getRateAssetForPrimitive(_quoteAsset);
        uint256 baseAssetUnit = getUnitForPrimitive(_baseAsset);
        uint256 quoteAssetUnit = getUnitForPrimitive(_quoteAsset);

        // If rates are both in ETH or both in USD
        if (baseAssetRateAsset == quoteAssetRateAsset) {
            return
                __calcConversionAmountSameRateAsset(
                    _baseAssetAmount,
                    baseAssetUnit,
                    _baseAssetRate,
                    quoteAssetUnit,
                    _quoteAssetRate
                );
        }

        int256 ethPerUsdRate = IChainlinkAggregator(ethUsdAggregator).latestAnswer();
        require(ethPerUsdRate > 0, "__calcConversionAmount: Bad ethUsd rate");

        // If _baseAsset's rate is in ETH and _quoteAsset's rate is in USD
        if (baseAssetRateAsset == RateAsset.ETH) {
            return
                __calcConversionAmountEthRateAssetToUsdRateAsset(
                    _baseAssetAmount,
                    baseAssetUnit,
                    _baseAssetRate,
                    quoteAssetUnit,
                    _quoteAssetRate,
                    uint256(ethPerUsdRate)
                );
        }

        // If _baseAsset's rate is in USD and _quoteAsset's rate is in ETH
        return
            __calcConversionAmountUsdRateAssetToEthRateAsset(
                _baseAssetAmount,
                baseAssetUnit,
                _baseAssetRate,
                quoteAssetUnit,
                _quoteAssetRate,
                uint256(ethPerUsdRate)
            );
    }

    /// @dev Helper to convert amounts where the base asset has an ETH rate and the quote asset has a USD rate
    function __calcConversionAmountEthRateAssetToUsdRateAsset(
        uint256 _baseAssetAmount,
        uint256 _baseAssetUnit,
        uint256 _baseAssetRate,
        uint256 _quoteAssetUnit,
        uint256 _quoteAssetRate,
        uint256 _ethPerUsdRate
    ) private pure returns (uint256 quoteAssetAmount_) {
        // Only allows two consecutive multiplication operations to avoid potential overflow.
        // Intermediate step needed to resolve stack-too-deep error.
        uint256 intermediateStep = _baseAssetAmount.mul(_baseAssetRate).mul(_ethPerUsdRate).div(
            ETH_UNIT
        );

        return intermediateStep.mul(_quoteAssetUnit).div(_baseAssetUnit).div(_quoteAssetRate);
    }

    /// @dev Helper to convert amounts where base and quote assets both have ETH rates or both have USD rates
    function __calcConversionAmountSameRateAsset(
        uint256 _baseAssetAmount,
        uint256 _baseAssetUnit,
        uint256 _baseAssetRate,
        uint256 _quoteAssetUnit,
        uint256 _quoteAssetRate
    ) private pure returns (uint256 quoteAssetAmount_) {
        // Only allows two consecutive multiplication operations to avoid potential overflow
        return
            _baseAssetAmount.mul(_baseAssetRate).mul(_quoteAssetUnit).div(
                _baseAssetUnit.mul(_quoteAssetRate)
            );
    }

    /// @dev Helper to convert amounts where the base asset has a USD rate and the quote asset has an ETH rate
    function __calcConversionAmountUsdRateAssetToEthRateAsset(
        uint256 _baseAssetAmount,
        uint256 _baseAssetUnit,
        uint256 _baseAssetRate,
        uint256 _quoteAssetUnit,
        uint256 _quoteAssetRate,
        uint256 _ethPerUsdRate
    ) private pure returns (uint256 quoteAssetAmount_) {
        // Only allows two consecutive multiplication operations to avoid potential overflow
        // Intermediate step needed to resolve stack-too-deep error.
        uint256 intermediateStep = _baseAssetAmount.mul(_baseAssetRate).mul(_quoteAssetUnit).div(
            _ethPerUsdRate
        );

        return intermediateStep.mul(ETH_UNIT).div(_baseAssetUnit).div(_quoteAssetRate);
    }

    /// @dev Helper to get the latest rate for a given primitive
    function __getLatestRateData(address _primitive) private view returns (int256 rate_) {
        if (_primitive == WETH_TOKEN) {
            return int256(ETH_UNIT);
        }

        address aggregator = primitiveToAggregatorInfo[_primitive].aggregator;
        require(aggregator != address(0), "__getLatestRateData: Primitive does not exist");

        return IChainlinkAggregator(aggregator).latestAnswer();
    }

    /////////////////////////
    // PRIMITIVES REGISTRY //
    /////////////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Removes stale primitives from the feed
    /// @param _primitives The stale primitives to remove
    /// @dev Callable by anybody
    function removeStalePrimitives(address[] calldata _primitives) external {
        for (uint256 i; i < _primitives.length; i++) {
            address aggregatorAddress = primitiveToAggregatorInfo[_primitives[i]].aggregator;
            require(aggregatorAddress != address(0), "removeStalePrimitives: Invalid primitive");
            require(rateIsStale(aggregatorAddress), "removeStalePrimitives: Rate is not stale");

            delete primitiveToAggregatorInfo[_primitives[i]];
            delete primitiveToUnit[_primitives[i]];

            emit StalePrimitiveRemoved(_primitives[i]);
        }
    }

    // INTERNAL FUNCTIONS

    /// @notice Adds a list of primitives with the given aggregator and rateAsset values
    /// @param _primitives The primitives to add
    /// @param _aggregators The ordered aggregators corresponding to the list of _primitives
    /// @param _rateAssets The ordered rate assets corresponding to the list of _primitives
    function __addPrimitives(
        address[] calldata _primitives,
        address[] calldata _aggregators,
        RateAsset[] calldata _rateAssets
    ) internal {
        require(
            _primitives.length == _aggregators.length,
            "__addPrimitives: Unequal _primitives and _aggregators array lengths"
        );
        require(
            _primitives.length == _rateAssets.length,
            "__addPrimitives: Unequal _primitives and _rateAssets array lengths"
        );

        for (uint256 i; i < _primitives.length; i++) {
            require(
                primitiveToAggregatorInfo[_primitives[i]].aggregator == address(0),
                "__addPrimitives: Value already set"
            );

            __validateAggregator(_aggregators[i]);

            primitiveToAggregatorInfo[_primitives[i]] = AggregatorInfo({
                aggregator: _aggregators[i],
                rateAsset: _rateAssets[i]
            });

            // Store the amount that makes up 1 unit given the asset's decimals
            uint256 unit = 10**uint256(ERC20(_primitives[i]).decimals());
            primitiveToUnit[_primitives[i]] = unit;

            emit PrimitiveAdded(_primitives[i], _aggregators[i], _rateAssets[i], unit);
        }
    }

    /// @notice Removes a list of primitives from the feed
    /// @param _primitives The primitives to remove
    function __removePrimitives(address[] calldata _primitives) internal {
        for (uint256 i; i < _primitives.length; i++) {
            require(
                primitiveToAggregatorInfo[_primitives[i]].aggregator != address(0),
                "removePrimitives: Primitive not yet added"
            );

            delete primitiveToAggregatorInfo[_primitives[i]];
            delete primitiveToUnit[_primitives[i]];

            emit PrimitiveRemoved(_primitives[i]);
        }
    }

    /// @notice Sets the `staleRateThreshold` variable
    /// @param _nextStaleRateThreshold The next `staleRateThreshold` value
    function __setStaleRateThreshold(uint256 _nextStaleRateThreshold) internal {
        uint256 prevStaleRateThreshold = staleRateThreshold;
        require(
            _nextStaleRateThreshold != prevStaleRateThreshold,
            "__setStaleRateThreshold: Value already set"
        );

        staleRateThreshold = _nextStaleRateThreshold;

        emit StaleRateThresholdSet(prevStaleRateThreshold, _nextStaleRateThreshold);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to validate an aggregator by checking its return values for the expected interface
    function __validateAggregator(address _aggregator) private view {
        require(
            IChainlinkAggregator(_aggregator).latestAnswer() > 0,
            "__validateAggregator: No rate detected"
        );
        require(!rateIsStale(_aggregator), "__validateAggregator: Stale rate detected");
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the aggregatorInfo variable value for a primitive
    /// @param _primitive The primitive asset for which to get the aggregatorInfo value
    /// @return aggregatorInfo_ The aggregatorInfo value
    function getAggregatorInfoForPrimitive(address _primitive)
        external
        view
        returns (AggregatorInfo memory aggregatorInfo_)
    {
        return primitiveToAggregatorInfo[_primitive];
    }

    /// @notice Gets the `ethUsdAggregator` variable value
    /// @return ethUsdAggregator_ The `ethUsdAggregator` variable value
    function getEthUsdAggregator() external view returns (address ethUsdAggregator_) {
        return ethUsdAggregator;
    }

    /// @notice Gets the `staleRateThreshold` variable value
    /// @return staleRateThreshold_ The `staleRateThreshold` variable value
    function getStaleRateThreshold() external view returns (uint256 staleRateThreshold_) {
        return staleRateThreshold;
    }

    /// @notice Gets the rateAsset variable value for a primitive
    /// @return rateAsset_ The rateAsset variable value
    /// @dev This isn't strictly necessary as WETH_TOKEN will be undefined and thus
    /// the RateAsset will be the 0-position of the enum (i.e. ETH), but it makes the
    /// behavior more explicit
    function getRateAssetForPrimitive(address _primitive)
        public
        view
        returns (RateAsset rateAsset_)
    {
        if (_primitive == WETH_TOKEN) {
            return RateAsset.ETH;
        }

        return primitiveToAggregatorInfo[_primitive].rateAsset;
    }

    /// @notice Gets the unit variable value for a primitive
    /// @return unit_ The unit variable value
    function getUnitForPrimitive(address _primitive) public view returns (uint256 unit_) {
        if (_primitive == WETH_TOKEN) {
            return ETH_UNIT;
        }

        return primitiveToUnit[_primitive];
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the aggregator for a primitive
    /// @param _primitive The primitive asset for which to get the aggregator value
    /// @return aggregator_ The aggregator address
    function getAggregatorForPrimitive(address _primitive)
        public
        view
        returns (address aggregator_)
    {
        return primitiveToAggregatorInfo[_primitive].aggregator;
    }

    /// @notice Gets the `WETH_TOKEN` variable value
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() public view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
