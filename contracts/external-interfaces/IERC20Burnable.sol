// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

import {IERC20} from "./IERC20.sol";

/// @title IERC20Burnable Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IERC20Burnable is IERC20 {
    function burn(uint256 _amount) external;

    function burnFrom(address _account, uint256 _amount) external;
}
