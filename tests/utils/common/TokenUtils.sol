// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ERC20 as ERC20Base} from "openzeppelin-solc-0.8/token/ERC20/ERC20.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {CommonUtilsBase} from "tests/utils/bases/CommonUtilsBase.sol";

abstract contract TokenUtils is CommonUtilsBase {
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

    function increaseTokenBalance(IERC20 _token, address _to, uint256 _amount) internal {
        uint256 balance = _token.balanceOf(_to);

        deal(address(_token), _to, balance + _amount);
    }
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
