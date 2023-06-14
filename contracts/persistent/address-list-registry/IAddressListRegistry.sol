// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

/// @title IAddressListRegistry Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IAddressListRegistry {
    enum UpdateType {
        None,
        AddOnly,
        RemoveOnly,
        AddAndRemove
    }

    /////////////////////
    // LIST MANAGEMENT //
    /////////////////////

    function addToList(uint256 _id, address[] calldata _items) external;

    function attestLists(uint256[] calldata _ids, string[] calldata _descriptions) external;

    function createList(address _owner, UpdateType _updateType, address[] calldata _initialItems)
        external
        returns (uint256 id_);

    function removeFromList(uint256 _id, address[] calldata _items) external;

    function setListOwner(uint256 _id, address _nextOwner) external;

    function setListUpdateType(uint256 _id, UpdateType _nextUpdateType) external;

    /////////////////
    // LIST SEARCH //
    /////////////////

    function areAllInAllLists(uint256[] memory _ids, address[] memory _items)
        external
        view
        returns (bool areAllInAllLists_);

    function areAllInList(uint256 _id, address[] memory _items) external view returns (bool areAllInList_);

    function areAllInSomeOfLists(uint256[] memory _ids, address[] memory _items)
        external
        view
        returns (bool areAllInSomeOfLists_);

    function areAllNotInAnyOfLists(uint256[] memory _ids, address[] memory _items)
        external
        view
        returns (bool areAllNotInAnyOfLists_);

    function areAllNotInList(uint256 _id, address[] memory _items) external view returns (bool areAllNotInList_);

    function isInAllLists(uint256[] memory _ids, address _item) external view returns (bool isInAllLists_);

    function isInList(uint256 _id, address _item) external view returns (bool isInList_);

    function isInSomeOfLists(uint256[] memory _ids, address _item) external view returns (bool isInSomeOfLists_);

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getListCount() external view returns (uint256 count_);

    function getListOwner(uint256 _id) external view returns (address owner_);

    function getListUpdateType(uint256 _id) external view returns (UpdateType updateType_);
}
