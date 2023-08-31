// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../../persistent/address-list-registry/IAddressListRegistry.sol";
import "../../../../../core/fund/comptroller/ComptrollerLib.sol";
import "./PolicyBase.sol";

/// @title AddressListRegistryPerUserPolicyBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Base contract inheritable by any policy that uses the AddressListRegistry and wants to track lists per fund user
abstract contract AddressListRegistryPerUserPolicyBase is PolicyBase {
    event ListsSetForFundAndUser(address indexed comptrollerProxy, address indexed user, uint256[] listIds);

    IAddressListRegistry internal immutable ADDRESS_LIST_REGISTRY_CONTRACT;

    mapping(address => mapping(address => uint256[])) private comptrollerProxyToUserToListIds;

    constructor(address _policyUser, address _addressListRegistry) public PolicyBase(_policyUser) {
        ADDRESS_LIST_REGISTRY_CONTRACT = IAddressListRegistry(_addressListRegistry);
    }

    // EXTERNAL FUNCTIONS

    /// @notice Adds the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        virtual
        override
        onlyPolicyManager
    {
        __updateListsForFund(_comptrollerProxy, _encodedSettings);
    }

    // INTERNAL FUNCTIONS

    /// @dev Helper to set the lists to be used by a given fund and for specific users
    function __updateListsForFund(address _comptrollerProxy, bytes calldata _encodedSettings) internal {
        (address[] memory users, bytes[] memory listsData) = __decodePolicySettings(_encodedSettings);

        require(users.length == listsData.length, "__updateListsForFund: unequal arrays");

        for (uint256 i; i < listsData.length; i++) {
            __updateListsForFundAndUser(_comptrollerProxy, users[i], listsData[i]);
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to create new list from encoded data
    function __createAddressListFromData(address _vaultProxy, bytes memory _newListData)
        private
        returns (uint256 listId_)
    {
        (IAddressListRegistry.UpdateType updateType, address[] memory initialItems) = __decodeNewListData(_newListData);

        return ADDRESS_LIST_REGISTRY_CONTRACT.createList(_vaultProxy, updateType, initialItems);
    }

    /// @dev Helper to parse the args needed to create a new list
    function __decodeNewListData(bytes memory _newListData)
        private
        pure
        returns (IAddressListRegistry.UpdateType updateType_, address[] memory initialItems_)
    {
        return abi.decode(_newListData, (IAddressListRegistry.UpdateType, address[]));
    }

    /// @dev Helper to parse users and corresponding list data from encoded settings
    function __decodePolicySettings(bytes calldata _encodedSettings)
        private
        pure
        returns (address[] memory users_, bytes[] memory listsData_)
    {
        return abi.decode(_encodedSettings, (address[], bytes[]));
    }

    /// @dev Helper to parse the set of lists to be used for a given user
    function __decodeUserListsData(bytes memory _listData)
        private
        pure
        returns (uint256[] memory existingListIds_, bytes[] memory newListsData_)
    {
        return abi.decode(_listData, (uint256[], bytes[]));
    }

    /// @dev Helper to set the lists to be used by a given fund and user
    /// This is done in a simple manner rather than the most gas-efficient way possible
    /// (e.g., comparing already-stored items with an updated list would save on storage operations during updates).
    function __updateListsForFundAndUser(address _comptrollerProxy, address _user, bytes memory _listData) private {
        (uint256[] memory existingListIds, bytes[] memory newListsData) = __decodeUserListsData(_listData);

        // Clear the previously stored list ids as needed
        if (comptrollerProxyToUserToListIds[_comptrollerProxy][_user].length > 0) {
            delete comptrollerProxyToUserToListIds[_comptrollerProxy][_user];
        }

        uint256[] memory nextListIds = new uint256[](existingListIds.length + newListsData.length);

        if (nextListIds.length > 0) {
            // Add existing list ids.
            // No need to validate existence, policy will just fail if out-of-bounds index.
            for (uint256 i; i < existingListIds.length; i++) {
                nextListIds[i] = existingListIds[i];
                comptrollerProxyToUserToListIds[_comptrollerProxy][_user].push(existingListIds[i]);
            }

            // Create and add any new lists
            if (newListsData.length > 0) {
                address vaultProxy = ComptrollerLib(_comptrollerProxy).getVaultProxy();
                for (uint256 i; i < newListsData.length; i++) {
                    uint256 nextListIdsIndex = existingListIds.length + i;
                    nextListIds[nextListIdsIndex] = __createAddressListFromData(vaultProxy, newListsData[i]);
                    comptrollerProxyToUserToListIds[_comptrollerProxy][_user].push(nextListIds[nextListIdsIndex]);
                }
            }
        }

        emit ListsSetForFundAndUser(_comptrollerProxy, _user, nextListIds);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the list ids used by a given fund and user
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _user The user of the fund
    /// @return listIds_ The list ids
    function getListIdsForFundAndUser(address _comptrollerProxy, address _user)
        public
        view
        returns (uint256[] memory listIds_)
    {
        return comptrollerProxyToUserToListIds[_comptrollerProxy][_user];
    }
}
