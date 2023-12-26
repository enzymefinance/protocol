// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20 as OpenZeppelinIERC20} from "openzeppelin-solc-0.8/token/ERC20/IERC20.sol";
import {SafeERC20 as OpenZeppelinSafeERC20} from "openzeppelin-solc-0.8/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "../../../external-interfaces/IERC20.sol";

/// @title WrappedSafeERC20 Library
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Wraps OpenZeppelin's SafeERC20 library to use the local IERC20 interface for inputs
library WrappedSafeERC20 {
    function safeApprove(IERC20 _token, address _spender, uint256 _value) internal {
        OpenZeppelinSafeERC20.safeApprove({token: __castToken(_token), spender: _spender, value: _value});
    }

    function safeDecreaseAllowance(IERC20 _token, address _spender, uint256 _value) internal {
        OpenZeppelinSafeERC20.safeDecreaseAllowance({token: __castToken(_token), spender: _spender, value: _value});
    }

    function safeIncreaseAllowance(IERC20 _token, address _spender, uint256 _value) internal {
        OpenZeppelinSafeERC20.safeIncreaseAllowance({token: __castToken(_token), spender: _spender, value: _value});
    }

    function safeTransfer(IERC20 _token, address _to, uint256 _value) internal {
        OpenZeppelinSafeERC20.safeTransfer({token: __castToken(_token), to: _to, value: _value});
    }

    function safeTransferFrom(IERC20 _token, address _from, address _to, uint256 _value) internal {
        OpenZeppelinSafeERC20.safeTransferFrom({token: __castToken(_token), from: _from, to: _to, value: _value});
    }

    function __castToken(IERC20 _token) private pure returns (OpenZeppelinIERC20 token_) {
        return OpenZeppelinIERC20(address(_token));
    }
}
