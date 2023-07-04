// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {ILidoSteth} from "tests/interfaces/external/ILidoSteth.sol";

abstract contract LidoUtils is AddOnUtilsBase {
    function increaseStethBalance(address _to, uint256 _amount) internal {
        increaseNativeAssetBalance(_to, _amount);
        vm.prank(_to);
        ILidoSteth(ETHEREUM_STETH).submit{value: _amount}(_to);
    }
}
