// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../release/infrastructure/value-interpreter/IValueInterpreter.sol";
import "../../release/infrastructure/price-feeds/derivatives/IAggregatedDerivativePriceFeed.sol";
import "../../release/infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";

/// @dev This contract acts as a centralized rate provider for mocks.
/// Suited for a dev environment, it doesn't take into account gas costs.
contract CentralizedRateProvider is Ownable {
    using SafeMath for uint256;

    address private immutable WETH;
    uint256 private maxDeviationPerSender;

    // Addresses are not immutable to facilitate lazy load (they're are not accessible at the mock env).
    address private valueInterpreter;
    address private aggregateDerivativePriceFeed;
    address private primitivePriceFeed;

    constructor(address _weth, uint256 _maxDeviationPerSender) public {
        maxDeviationPerSender = _maxDeviationPerSender;
        WETH = _weth;
    }

    /// @dev Calculates the value of a _baseAsset relative to a _quoteAsset.
    /// Label to ValueInterprete's calcLiveAssetValue
    function calcLiveAssetValue(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) public returns (uint256 value_) {
        uint256 baseDecimalsRate = 10**uint256(ERC20(_baseAsset).decimals());
        uint256 quoteDecimalsRate = 10**uint256(ERC20(_quoteAsset).decimals());

        // 1. Check if quote asset is a primitive. If it is, use ValueInterpreter normally.
        if (IPrimitivePriceFeed(primitivePriceFeed).isSupportedAsset(_quoteAsset)) {
            (value_, ) = IValueInterpreter(valueInterpreter).calcLiveAssetValue(
                _baseAsset,
                _amount,
                _quoteAsset
            );
            return value_;
        }

        // 2. Otherwise, check if base asset is a primitive, and use inverse rate from Value Interpreter.
        if (IPrimitivePriceFeed(primitivePriceFeed).isSupportedAsset(_baseAsset)) {
            (uint256 inverseRate, ) = IValueInterpreter(valueInterpreter).calcLiveAssetValue(
                _quoteAsset,
                10**uint256(ERC20(_quoteAsset).decimals()),
                _baseAsset
            );

            uint256 rate = uint256(baseDecimalsRate).mul(quoteDecimalsRate).div(inverseRate);

            value_ = _amount.mul(rate).div(baseDecimalsRate);
            return value_;
        }

        // 3. If both assets are derivatives, calculate the rate against ETH.
        (uint256 baseToWeth, ) = IValueInterpreter(valueInterpreter).calcLiveAssetValue(
            _baseAsset,
            baseDecimalsRate,
            WETH
        );

        (uint256 quoteToWeth, ) = IValueInterpreter(valueInterpreter).calcLiveAssetValue(
            _quoteAsset,
            quoteDecimalsRate,
            WETH
        );

        value_ = _amount.mul(baseToWeth).mul(quoteDecimalsRate).div(quoteToWeth).div(
            baseDecimalsRate
        );
        return value_;
    }

    /// @dev Calculates a randomized live value of an asset
    /// Aggregation of two randomization seeds: msg.sender, and by block.number.
    function calcLiveAssetValueRandomized(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset,
        uint256 _maxDeviationPerBlock
    ) external returns (uint256 value_) {
        uint256 liveAssetValue = calcLiveAssetValue(_baseAsset, _amount, _quoteAsset);

        // Range [liveAssetValue * (1 - _blockNumberDeviation), liveAssetValue * (1 + _blockNumberDeviation)]
        uint256 senderRandomizedValue_ = __calcValueRandomizedByAddress(
            liveAssetValue,
            msg.sender,
            maxDeviationPerSender
        );

        // Range [liveAssetValue * (1 - _maxDeviationPerBlock - maxDeviationPerSender), liveAssetValue * (1 + _maxDeviationPerBlock + maxDeviationPerSender)]
        value_ = __calcValueRandomizedByUint(
            senderRandomizedValue_,
            block.number,
            _maxDeviationPerBlock
        );

        return value_;
    }

    /// @dev Calculates the live value of an asset including a grade of pseudo randomization, using msg.sender as the source of randomness
    function calcLiveAssetValueRandomizedByBlockNumber(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset,
        uint256 _maxDeviationPerBlock
    ) external returns (uint256 value_) {
        uint256 liveAssetValue = calcLiveAssetValue(_baseAsset, _amount, _quoteAsset);

        value_ = __calcValueRandomizedByUint(liveAssetValue, block.number, _maxDeviationPerBlock);

        return value_;
    }

    /// @dev Calculates the live value of an asset including a grade of pseudo-randomization, using `block.number` as the source of randomness
    function calcLiveAssetValueRandomizedBySender(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) external returns (uint256 value_) {
        uint256 liveAssetValue = calcLiveAssetValue(_baseAsset, _amount, _quoteAsset);

        value_ = __calcValueRandomizedByAddress(liveAssetValue, msg.sender, maxDeviationPerSender);

        return value_;
    }

    function setMaxDeviationPerSender(uint256 _maxDeviationPerSender) external onlyOwner {
        maxDeviationPerSender = _maxDeviationPerSender;
    }

    /// @dev Connector from release environment, inject price variables into the provider.
    function setReleasePriceAddresses(
        address _valueInterpreter,
        address _aggregateDerivativePriceFeed,
        address _primitivePriceFeed
    ) external onlyOwner {
        valueInterpreter = _valueInterpreter;
        aggregateDerivativePriceFeed = _aggregateDerivativePriceFeed;
        primitivePriceFeed = _primitivePriceFeed;
    }

    // PRIVATE FUNCTIONS

    /// @dev Calculates a a pseudo-randomized value as a seed an address
    function __calcValueRandomizedByAddress(
        uint256 _meanValue,
        address _seed,
        uint256 _maxDeviation
    ) private pure returns (uint256 value_) {
        // Value between [0, 100]
        uint256 senderRandomFactor = uint256(uint8(_seed))
            .mul(100)
            .div(256)
            .mul(_maxDeviation)
            .div(100);

        value_ = __calcDeviatedValue(_meanValue, senderRandomFactor, _maxDeviation);

        return value_;
    }

    /// @dev Calculates a a pseudo-randomized value as a seed an uint256
    function __calcValueRandomizedByUint(
        uint256 _meanValue,
        uint256 _seed,
        uint256 _maxDeviation
    ) private pure returns (uint256 value_) {
        // Depending on the _seed number, it will be one of {20, 40, 60, 80, 100}
        uint256 randomFactor = (_seed.mod(2).mul(20))
            .add((_seed.mod(3).mul(40)))
            .mul(_maxDeviation)
            .div(100);

        value_ = __calcDeviatedValue(_meanValue, randomFactor, _maxDeviation);

        return value_;
    }

    /// @dev Given a mean value and a max deviation, returns a value in the spectrum between 0 (_meanValue - maxDeviation) and 100 (_mean + maxDeviation)
    /// TODO: Refactor to use 18 decimal precision
    function __calcDeviatedValue(
        uint256 _meanValue,
        uint256 _offset,
        uint256 _maxDeviation
    ) private pure returns (uint256 value_) {
        return
            _meanValue.add((_meanValue.mul((uint256(2)).mul(_offset)).div(uint256(100)))).sub(
                _meanValue.mul(_maxDeviation).div(uint256(100))
            );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getMaxDeviationPerSender() public view returns (uint256 maxDeviationPerSender_) {
        return maxDeviationPerSender;
    }

    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return valueInterpreter;
    }
}
