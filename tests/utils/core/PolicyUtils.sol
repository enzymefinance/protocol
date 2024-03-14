// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

abstract contract PolicyUtils is CoreUtilsBase {
    function encodePolicyManagerConfigData(address[] memory _policies, bytes[] memory _settingsData)
        internal
        pure
        returns (bytes memory configData_)
    {
        return abi.encode(_policies, _settingsData);
    }

    // AddressListRegistryPolicyBase

    function encodeAddressListRegistryPolicySettingsWithNewList(address[] memory _initialItems)
        internal
        pure
        returns (bytes memory data_)
    {
        bytes[] memory newListsData = new bytes[](1);
        newListsData[0] = encodeAddressListRegistryPolicyNewListData({
            _updateType: IAddressListRegistryProd.UpdateType.AddAndRemove,
            _initialItems: _initialItems
        });

        return
            encodeAddressListRegistryPolicySettings({_existingListIds: new uint256[](0), _newListsData: newListsData});
    }

    function encodeAddressListRegistryPolicySettings(uint256[] memory _existingListIds, bytes[] memory _newListsData)
        internal
        pure
        returns (bytes memory data_)
    {
        return abi.encode(_existingListIds, _newListsData);
    }

    function encodeAddressListRegistryPolicyNewListData(
        IAddressListRegistryProd.UpdateType _updateType,
        address[] memory _initialItems
    ) internal pure returns (bytes memory data_) {
        return abi.encode(_updateType, _initialItems);
    }
}
