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
        // If the asset is already registered, either skip or remove it
        bool isRegistered = _valueInterpreter.isSupportedAsset(_tokenAddress);
        if (isRegistered && _skipIfRegistered) {
            return;
        }
        removeIfSupportedAsset({_valueInterpreter: _valueInterpreter, _tokenAddress: _tokenAddress});

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
        // If the asset is already registered, either skip or remove it
        bool isRegistered = _valueInterpreter.isSupportedAsset(_tokenAddress);
        if (isRegistered && _skipIfRegistered) {
            return;
        }

        removeIfSupportedAsset({_valueInterpreter: _valueInterpreter, _tokenAddress: _tokenAddress});

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

    function addPrimitivesWithTestAggregator(
        IValueInterpreter _valueInterpreter,
        address[] memory _tokenAddresses,
        bool _skipIfRegistered
    ) internal returns (TestAggregator[] memory aggregators_) {
        aggregators_ = new TestAggregator[](_tokenAddresses.length);
        for (uint256 i; i < _tokenAddresses.length; i++) {
            aggregators_[i] = addPrimitiveWithTestAggregator(_valueInterpreter, _tokenAddresses[i], _skipIfRegistered);
        }

        return aggregators_;
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

    function registerPrimitivePairWithPrice(
        IValueInterpreter _valueInterpreter,
        IERC20 _assetA,
        IERC20 _assetB,
        uint256 _assetBAmountPerUnitA
    ) internal {
        require(_assetA != _assetB, "registerPrimitivePairWithPrice: same asset");

        // Both assets should use the same feed quote asset, i.e., intermediary asset.
        // Since WETH is auto-mapped to ETH and we can't deregister it, we must use ETH as the rate asset.
        ChainlinkRateAsset rateAsset = ChainlinkRateAsset.ETH;

        // If weth is assetA, reverse the asset order
        address wethAddress = _valueInterpreter.getWethToken();
        if (address(_assetA) == wethAddress) {
            _assetBAmountPerUnitA = assetUnit(_assetA) * assetUnit(_assetB) / _assetBAmountPerUnitA;
            (_assetA, _assetB) = (_assetB, _assetA);
        }

        // TODO: need to include asset unit?
        TestAggregator assetAAggregator = TestAggregator(address(createTestAggregator(_assetBAmountPerUnitA)));
        addPrimitive({
            _valueInterpreter: _valueInterpreter,
            _tokenAddress: address(_assetA),
            _aggregatorAddress: address(assetAAggregator),
            _rateAsset: rateAsset,
            _skipIfRegistered: false
        });

        if (address(_assetB) != wethAddress) {
            // feed1 is 1:1 with WETH
            uint256 assetBAmount = assetUnit(_assetB);
            TestAggregator assetBAggregator = TestAggregator(address(createTestAggregator(assetBAmount)));
            addPrimitive({
                _valueInterpreter: _valueInterpreter,
                _tokenAddress: address(_assetB),
                _aggregatorAddress: address(assetBAggregator),
                _rateAsset: rateAsset,
                _skipIfRegistered: false
            });
        }

        // Double-check that the registered price is what we expect
        uint256 newCanonicalPrice = _valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: address(_assetA),
            _amount: assetUnit(_assetA),
            _quoteAsset: address(_assetB)
        });
        assertApproxEqAbs(newCanonicalPrice, _assetBAmountPerUnitA, 1, "registerPrimitivePairWithPrice: price mismatch");
    }

    function removeIfSupportedAsset(IValueInterpreter _valueInterpreter, address _tokenAddress) internal {
        require(_tokenAddress != _valueInterpreter.getWethToken(), "removeIfSupportedAsset: weth");

        vm.startPrank(_valueInterpreter.getOwner());

        if (_valueInterpreter.isSupportedPrimitiveAsset(_tokenAddress)) {
            _valueInterpreter.removePrimitives(toArray(_tokenAddress));
        } else if (_valueInterpreter.isSupportedDerivativeAsset(_tokenAddress)) {
            _valueInterpreter.removeDerivatives(toArray(_tokenAddress));
        }

        vm.stopPrank();
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
