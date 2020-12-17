// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../../vault/IVault.sol";

/// @title IFundLifecycleLib Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IFundLifecycleLib {
    function activate(address, bool) external;

    function configureExtensions(bytes calldata, bytes calldata) external;

    function destruct() external;

    function init(address, uint256) external;
}
