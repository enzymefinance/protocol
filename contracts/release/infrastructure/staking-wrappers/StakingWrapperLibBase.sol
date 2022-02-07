// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./StakingWrapperBase.sol";

/// @title StakingWrapperLibBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A staking wrapper base for proxy targets, extending StakingWrapperBase
abstract contract StakingWrapperLibBase is StakingWrapperBase {
    event TokenNameSet(string name);

    event TokenSymbolSet(string symbol);

    string private tokenName;
    string private tokenSymbol;

    /// @dev Helper function to set token name
    function __setTokenName(string memory _name) internal {
        tokenName = _name;

        emit TokenNameSet(_name);
    }

    /// @dev Helper function to set token symbol
    function __setTokenSymbol(string memory _symbol) internal {
        tokenSymbol = _symbol;

        emit TokenSymbolSet(_symbol);
    }

    /////////////////////
    // ERC20 OVERRIDES //
    /////////////////////

    /// @notice Gets the token name
    /// @return name_ The token name
    /// @dev Overrides the constructor-set storage for use in proxies
    function name() public view override returns (string memory name_) {
        return tokenName;
    }

    /// @notice Gets the token symbol
    /// @return symbol_ The token symbol
    /// @dev Overrides the constructor-set storage for use in proxies
    function symbol() public view override returns (string memory symbol_) {
        return tokenSymbol;
    }
}
