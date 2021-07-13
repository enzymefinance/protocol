// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../vault/IVault.sol";
import "./IExternalPosition.sol";

/// @title ExternalPositionProxy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A proxy for all external positions, modified from EIP-1822
contract ExternalPositionProxy {
    uint256 private immutable EXTERNAL_POSITION_TYPE;
    address private immutable VAULT_PROXY;

    /// @dev Needed to receive ETH on external positions
    receive() external payable {}

    constructor(
        bytes memory _constructData,
        address _vaultProxy,
        uint256 _externalPositionType,
        address _initialLib
    ) public {
        VAULT_PROXY = _vaultProxy;
        EXTERNAL_POSITION_TYPE = _externalPositionType;

        (bool success, bytes memory returnData) = _initialLib.delegatecall(_constructData);
        require(success, string(returnData));
    }

    // solhint-disable-next-line no-complex-fallback
    fallback() external payable {
        address contractLogic = IVault(VAULT_PROXY).getExternalPositionLibForType(
            EXTERNAL_POSITION_TYPE
        );
        assembly {
            calldatacopy(0x0, 0x0, calldatasize())
            let success := delegatecall(
                sub(gas(), 10000),
                contractLogic,
                0x0,
                calldatasize(),
                0,
                0
            )
            let retSz := returndatasize()
            returndatacopy(0, 0, retSz)
            switch success
                case 0 {
                    revert(0, retSz)
                }
                default {
                    return(0, retSz)
                }
        }
    }

    /// @notice Delegates call to IExternalPosition.receiveCallFromVault
    /// @param _data The bytes data variable to be decoded at the External Position
    function receiveCallFromVault(bytes calldata _data) external {
        require(
            msg.sender == VAULT_PROXY,
            "receiveCallFromVault: Only the vault can make this call"
        );
        address contractLogic = IVault(VAULT_PROXY).getExternalPositionLibForType(
            EXTERNAL_POSITION_TYPE
        );
        (bool success, bytes memory returnData) = contractLogic.delegatecall(
            abi.encodeWithSelector(IExternalPosition.receiveCallFromVault.selector, _data)
        );

        require(success, string(returnData));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `EXTERNAL_POSITION_TYPE` variable
    /// @return externalPositionType_ The `EXTERNAL_POSITION_TYPE` variable value
    function getExternalPositionType() external view returns (uint256 externalPositionType_) {
        return EXTERNAL_POSITION_TYPE;
    }

    /// @notice Gets the `VAULT_PROXY` variable
    /// @return vaultProxy_ The `VAULT_PROXY` variable value
    function getVaultProxy() external view returns (address vaultProxy_) {
        return VAULT_PROXY;
    }
}
