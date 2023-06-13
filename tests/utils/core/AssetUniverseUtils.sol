// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

enum ChainlinkRateAsset {
    ETH,
    USD
}

abstract contract AssetUniverseUtils is CoreUtilsBase {
    // AGGREGATORS

    function createTestAggregator(uint256 _price) internal returns (IChainlinkAggregator aggregator_) {
        return IChainlinkAggregator(address(new TestAggregator(_price)));
    }

    function deployUsdEthSimulatedAggregator(address _ethUsdAggregatorAddress)
        internal
        returns (IChainlinkAggregator aggregator_)
    {
        return IChainlinkAggregator(deployCode("UsdEthSimulatedAggregator.sol", abi.encode(_ethUsdAggregatorAddress)));
    }

    // ASSET REGISTRATION

    function addDerivative(
        IValueInterpreter _valueInterpreter,
        address _tokenAddress,
        address _priceFeedAddress,
        bool _skipIfRegistered
    ) internal {
        bool isRegistered = _valueInterpreter.isSupportedAsset(_tokenAddress);
        if (isRegistered) {
            if (_skipIfRegistered) {
                return;
            } else {
                revert("addDerivative: already registered");
            }
        }

        vm.prank(_valueInterpreter.getOwner());

        _valueInterpreter.addDerivatives(toArray(_tokenAddress), toArray(_priceFeedAddress));
    }

    function addDerivatives(
        IValueInterpreter _valueInterpreter,
        address[] memory _tokenAddresses,
        address[] memory _priceFeedAddresses,
        bool _skipIfRegistered
    ) internal {
        for (uint256 i; i < _tokenAddresses.length; i++) {
            addDerivative(_valueInterpreter, _tokenAddresses[i], _priceFeedAddresses[i], _skipIfRegistered);
        }
    }

    function addPrimitive(
        IValueInterpreter _valueInterpreter,
        address _tokenAddress,
        address _aggregatorAddress,
        ChainlinkRateAsset _rateAsset,
        bool _skipIfRegistered
    ) internal {
        bool isRegistered = _valueInterpreter.isSupportedAsset(_tokenAddress);
        if (isRegistered) {
            if (_skipIfRegistered) {
                return;
            } else {
                revert("addPrimitive: already registered");
            }
        }

        uint8[] memory rateAssetsUint8 = new uint8[](1);
        rateAssetsUint8[0] = uint8(_rateAsset);

        vm.prank(_valueInterpreter.getOwner());

        _valueInterpreter.addPrimitives({
            _primitives: toArray(_tokenAddress),
            _aggregators: toArray(_aggregatorAddress),
            _rateAssets: rateAssetsUint8
        });
    }

    function addPrimitives(
        IValueInterpreter _valueInterpreter,
        address[] memory _tokenAddresses,
        address[] memory _aggregatorAddresses,
        ChainlinkRateAsset[] memory _rateAssets,
        bool _skipIfRegistered
    ) internal {
        for (uint256 i; i < _tokenAddresses.length; i++) {
            addPrimitive(
                _valueInterpreter, _tokenAddresses[i], _aggregatorAddresses[i], _rateAssets[i], _skipIfRegistered
            );
        }
    }

    function addPrimitiveWithTestAggregator(
        IValueInterpreter _valueInterpreter,
        address _tokenAddress,
        bool _skipIfRegistered
    ) internal returns (TestAggregator aggregator_) {
        aggregator_ = TestAggregator(address(createTestAggregator(1 ether)));

        addPrimitive(_valueInterpreter, _tokenAddress, address(aggregator_), ChainlinkRateAsset.ETH, _skipIfRegistered);

        return aggregator_;
    }

    function createRegisteredPrimitive(IValueInterpreter _valueInterpreter, uint8 _decimals)
        internal
        returns (IERC20 token_)
    {
        token_ = createTestToken(_decimals);

        addPrimitive({
            _valueInterpreter: _valueInterpreter,
            _tokenAddress: address(token_),
            _aggregatorAddress: address(createTestAggregator(1 ether)),
            _rateAsset: ChainlinkRateAsset.ETH,
            _skipIfRegistered: false
        });

        return token_;
    }

    // VALUE CALCS

    function calcTokenPrice(IValueInterpreter _valueInterpreter, IERC20 _baseAsset, IERC20 _quoteAsset)
        internal
        returns (uint256 valueOfOneUnit_)
    {
        return _valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: address(_baseAsset),
            _amount: assetUnit(_baseAsset),
            _quoteAsset: address(_quoteAsset)
        });
    }
}

contract TestAggregator is IChainlinkAggregator {
    uint256 internal price;

    constructor(uint256 _price) {
        setPrice(_price);
    }

    function setPrice(uint256 _price) public {
        price = _price;
    }

    function latestRoundData() external view virtual returns (uint80, int256, uint256, uint256, uint80) {
        return (0, int256(price), 0, block.timestamp, 0);
    }
}
