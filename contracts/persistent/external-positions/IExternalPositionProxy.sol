// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IExternalPositionProxy interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An interface for publicly accessible functions on the ExternalPositionProxy
interface IExternalPositionProxy {
    function getExternalPositionType() external view returns (uint256 typeId_);

    function getVaultProxy() external view returns (address vaultProxy_);

    function receiveCallFromVault(bytes memory _data) external;
}
