// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IChainlinkPriceFeedMixin as IChainlinkPriceFeedMixinProd} from
    "contracts/release/infrastructure/price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

contract ValueInterpreterTest is IntegrationTest {
    function test_wethPrice(address _quoteAsset, uint256 _result) internal {
        uint256 value = core.release.valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: address(wethToken),
            _amount: 1 ether,
            _quoteAsset: _quoteAsset
        });

        assert(value == _result);
    }

    function getInverseValue(address _baseAsset, address _quoteAsset, uint256 _baseAssetAmount)
        internal
        returns (uint256)
    {
        uint256 value = core.release.valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: _baseAsset,
            _amount: _baseAssetAmount,
            _quoteAsset: _quoteAsset
        });

        uint256 inverseValue = core.release.valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: _quoteAsset,
            _amount: value,
            _quoteAsset: _baseAsset
        });

        return inverseValue;
    }
}

contract ValueInterpreterTestEthereum is ValueInterpreterTest {
    address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address internal constant DAI_AGGREGATOR = 0x773616E4d11A78F511299002da57A0a94577F1f4;

    function setUp() public override {
        setUpMainnetEnvironment(16733210);

        addPrimitive({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: DAI,
            _aggregatorAddress: DAI_AGGREGATOR,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.ETH,
            _skipIfRegistered: true
        });
    }

    function test_wethPrice() public {
        test_wethPrice(DAI, 1647056889690851868858); // 1647.056889690852 DAI
    }

    function test_InverseValuesAreEqual(uint256 _wethAmount) public {
        _wethAmount = bound(_wethAmount, 10, 10_000_000 ether);

        uint256 inverseValue = getInverseValue(address(wethToken), DAI, _wethAmount);

        // allow rounding error of 1 wei
        assert(_wethAmount - inverseValue <= 1);
    }
}

contract ValueInterpreterTestPolygon is ValueInterpreterTest {
    address internal constant DAI = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;
    address internal constant DAI_AGGREGATOR = 0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D;

    function setUp() public override {
        setUpPolygonEnvironment(39841068);

        addPrimitive({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: DAI,
            _aggregatorAddress: DAI_AGGREGATOR,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.USD,
            _skipIfRegistered: true
        });
    }

    function test_wethPrice() public {
        test_wethPrice(DAI, 1656907072121636490947); // 1647.056889690852 DAI
    }

    function test_InverseValuesAreEqual(uint256 _wethAmount) public {
        _wethAmount = bound(_wethAmount, 10, 10_000_000 ether);

        uint256 inverseValue = getInverseValue(address(wethToken), DAI, _wethAmount);

        // allow rounding error of 1 wei
        assert(_wethAmount - inverseValue <= 1);
    }
}
