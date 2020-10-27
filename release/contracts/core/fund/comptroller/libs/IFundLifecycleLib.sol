// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../vault/IVault.sol";

/// @title IFundLifecycleLib Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFundLifecycleLib {
    function activate(address, bool) external;

    function destruct() external;

    function init(
        address,
        uint256,
        bytes calldata,
        bytes calldata
    ) external;
}
