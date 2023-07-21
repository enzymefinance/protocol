// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeMath} from "openzeppelin-solc-0.8/utils/math/SafeMath.sol";
import {ERC20 as ERC20Base} from "openzeppelin-solc-0.8/token/ERC20/ERC20.sol";

import {CommonUtilsBase} from "tests/utils/bases/CommonUtilsBase.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

abstract contract TokenUtils is CommonUtilsBase {
    function assetUnit(IERC20 _asset) internal view returns (uint256 unit_) {
        return 10 ** _asset.decimals();
    }

    function createTestToken(uint8 _decimals, string memory _name, string memory _symbol)
        internal
        returns (IERC20 token_)
    {
        address tokenAddress = address(new TestToken(_name, _symbol, _decimals));
        vm.label(tokenAddress, _name);

        return IERC20(tokenAddress);
    }

    function createTestToken(uint8 _decimals) internal returns (IERC20 token_) {
        return createTestToken(_decimals, "Test Token", "TEST");
    }

    function createTestToken() internal returns (IERC20 token_) {
        return createTestToken(18);
    }

    function createTestToken(string memory _name) internal returns (IERC20 token_) {
        return createTestToken(18, _name, "TEST");
    }

    /// @dev Helper to aggregate amounts of the same assets
    function aggregateAssetAmounts(address[] memory _rawAssets, uint256[] memory _rawAmounts, bool _ceilingAtMax)
        internal
        pure
        returns (address[] memory aggregatedAssets_, uint256[] memory aggregatedAmounts_)
    {
        if (_rawAssets.length == 0) {
            return (aggregatedAssets_, aggregatedAmounts_);
        }

        uint256 aggregatedAssetCount = 1;
        for (uint256 i = 1; i < _rawAssets.length; i++) {
            bool contains;
            for (uint256 j; j < i; j++) {
                if (_rawAssets[i] == _rawAssets[j]) {
                    contains = true;
                    break;
                }
            }
            if (!contains) {
                aggregatedAssetCount++;
            }
        }

        aggregatedAssets_ = new address[](aggregatedAssetCount);
        aggregatedAmounts_ = new uint256[](aggregatedAssetCount);
        uint256 aggregatedAssetIndex;
        for (uint256 i; i < _rawAssets.length; i++) {
            bool contains;
            for (uint256 j; j < aggregatedAssetIndex; j++) {
                if (_rawAssets[i] == aggregatedAssets_[j]) {
                    contains = true;

                    // make sure we don't overflow
                    (bool notOverflowed, uint256 sum) = SafeMath.tryAdd(aggregatedAmounts_[j], _rawAmounts[i]);
                    if (notOverflowed == true) {
                        aggregatedAmounts_[j] = sum;
                    } else {
                        if (_ceilingAtMax == false) {
                            revert("TokenUtils: overflow");
                        }
                        aggregatedAmounts_[j] = type(uint256).max;
                    }

                    break;
                }
            }
            if (!contains) {
                aggregatedAssets_[aggregatedAssetIndex] = _rawAssets[i];
                aggregatedAmounts_[aggregatedAssetIndex] = _rawAmounts[i];
                aggregatedAssetIndex++;
            }
        }

        return (aggregatedAssets_, aggregatedAmounts_);
    }

    // function increaseNativeAssetBalance(address _to, uint256 _amount) internal {
    //     uint256 balance = _to.balance;

    //     deal(_to, balance + _amount);
    // }

    // /// @dev The default `deal()` implementation doesn't work with rebasing tokens, tokens using storage packing for balances, etc.
    // /// e.g., Aave aTokens, Lido stETH, etc. See: currently doesn't work with aTokens https://github.com/foundry-rs/forge-std/issues/140
    // /// As a workaround, inheriting utils can override this function to handle the various non-standard tokens per-network.
    // function increaseTokenBalance(IERC20 _token, address _to, uint256 _amount) internal {
    //     uint256 balance = _token.balanceOf(_to);

    //     deal(address(_token), _to, balance + _amount);
    // }
}

contract TestToken is ERC20Base {
    uint8 internal immutable DECIMALS;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) ERC20Base(_name, _symbol) {
        DECIMALS = _decimals;
    }

    function decimals() public view virtual override returns (uint8) {
        return DECIMALS;
    }
}
