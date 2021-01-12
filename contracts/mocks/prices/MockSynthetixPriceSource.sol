// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./../../release/interfaces/ISynthetixExchangeRates.sol";
import "../prices/MockChainlinkPriceSource.sol";

/// @dev This price source offers two different options getting prices
/// The first one is getting a fixed rate, which can be useful for tests
/// The second approach calculates dinamically the rate making use of a chainlink price source
/// Mocks the functionality of the folllowing Synthetix contracts: { Exchanger, ExchangeRates }
contract MockSynthetixPriceSource is Ownable, ISynthetixExchangeRates {
    using SafeMath for uint256;

    mapping(bytes32 => uint256) private fixedRate;
    mapping(bytes32 => AggregatorInfo) private currencyKeyToAggregator;

    enum RateAsset {ETH, USD}

    struct AggregatorInfo {
        address aggregator;
        RateAsset rateAsset;
    }

    constructor(address _ethUsdAggregator) public {
        currencyKeyToAggregator[bytes32("ETH")] = AggregatorInfo({
            aggregator: _ethUsdAggregator,
            rateAsset: RateAsset.USD
        });
    }

    function setPriceSourcesForCurrencyKeys(
        bytes32[] calldata _currencyKeys,
        address[] calldata _aggregators,
        RateAsset[] calldata _rateAssets
    ) external onlyOwner {
        require(
            _currencyKeys.length == _aggregators.length &&
                _rateAssets.length == _aggregators.length
        );
        for (uint256 i = 0; i < _currencyKeys.length; i++) {
            currencyKeyToAggregator[_currencyKeys[i]] = AggregatorInfo({
                aggregator: _aggregators[i],
                rateAsset: _rateAssets[i]
            });
        }
    }

    function setRate(bytes32 _currencyKey, uint256 _rate) external onlyOwner {
        fixedRate[_currencyKey] = _rate;
    }

    /// @dev Calculates the rate from a currency key against USD
    function rateAndInvalid(bytes32 _currencyKey)
        external
        view
        override
        returns (uint256 rate_, bool isInvalid_)
    {
        uint256 storedRate = getFixedRate(_currencyKey);
        if (storedRate != 0) {
            rate_ = storedRate;
        } else {
            AggregatorInfo memory aggregatorInfo = getAggregatorFromCurrencyKey(_currencyKey);
            address aggregator = aggregatorInfo.aggregator;
            if (aggregator == address(0)) {
                rate_ = 0;
                isInvalid_ = true;
                return (rate_, isInvalid_);
            }
            uint256 decimals = MockChainlinkPriceSource(aggregator).decimals();
            rate_ = uint256(MockChainlinkPriceSource(aggregator).latestAnswer()).mul(
                10**(uint256(18).sub(decimals))
            );

            if (aggregatorInfo.rateAsset == RateAsset.ETH) {
                uint256 ethToUsd = uint256(
                    MockChainlinkPriceSource(
                        getAggregatorFromCurrencyKey(bytes32("ETH"))
                            .aggregator
                    )
                        .latestAnswer()
                );
                rate_ = rate_.mul(ethToUsd).div(10**8);
            }
        }

        isInvalid_ = (rate_ == 0);
        return (rate_, isInvalid_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getAggregatorFromCurrencyKey(bytes32 _currencyKey)
        public
        view
        returns (AggregatorInfo memory _aggregator)
    {
        return currencyKeyToAggregator[_currencyKey];
    }

    function getFixedRate(bytes32 _currencyKey) public view returns (uint256) {
        return fixedRate[_currencyKey];
    }
}
