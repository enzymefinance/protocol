// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./IPolicyManager.sol";

/// @title Policy Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPolicy {
    function activateForFund(address _comptrollerProxy, address _vaultProxy) external;

    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings) external;

    function identifier() external pure returns (string memory identifier_);

    function implementedHooks()
        external
        view
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_);

    function updateFundSettings(
        address _comptrollerProxy,
        address _vaultProxy,
        bytes calldata _encodedSettings
    ) external;

    function validateRule(
        address _comptrollerProxy,
        address _vaultProxy,
        IPolicyManager.PolicyHook _hook,
        bytes calldata _encodedArgs
    ) external returns (bool isValid_);
}
