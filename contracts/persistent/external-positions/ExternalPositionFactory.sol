// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../dispatcher/IDispatcher.sol";
import "./ExternalPositionProxy.sol";

/// @title ExternalPositionFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract factory for External Positions
contract ExternalPositionFactory {
    event PositionDeployed(
        address indexed vaultProxy,
        uint256 indexed typeId,
        address indexed constructLib,
        bytes constructData
    );

    event PositionDeployerAdded(address positionDeployer);

    event PositionDeployerRemoved(address positionDeployer);

    event PositionTypeAdded(uint256 typeId, string label);

    event PositionTypeLabelUpdated(uint256 indexed typeId, string label);

    address private immutable DISPATCHER;

    uint256 private positionTypeCounter;
    mapping(uint256 => string) private positionTypeIdToLabel;
    mapping(address => bool) private accountToIsExternalPositionProxy;
    mapping(address => bool) private accountToIsPositionDeployer;

    modifier onlyDispatcherOwner {
        require(
            msg.sender == IDispatcher(getDispatcher()).getOwner(),
            "Only the Dispatcher owner can call this function"
        );
        _;
    }

    constructor(address _dispatcher) public {
        DISPATCHER = _dispatcher;
    }

    /// @notice Creates a new external position proxy and adds it to the list of supported external positions
    /// @param _constructData Encoded data to be used on the ExternalPositionProxy constructor
    /// @param _vaultProxy The _vaultProxy owner of the external position
    /// @param _typeId The type of external position to be created
    /// @param _constructLib The external position lib contract that will be used on the constructor
    function deploy(
        address _vaultProxy,
        uint256 _typeId,
        address _constructLib,
        bytes memory _constructData
    ) external returns (address externalPositionProxy_) {
        require(
            isPositionDeployer(msg.sender),
            "deploy: Only a position deployer can call this function"
        );

        externalPositionProxy_ = address(
            new ExternalPositionProxy(_vaultProxy, _typeId, _constructLib, _constructData)
        );

        accountToIsExternalPositionProxy[externalPositionProxy_] = true;

        emit PositionDeployed(_vaultProxy, _typeId, _constructLib, _constructData);

        return externalPositionProxy_;
    }

    ////////////////////
    // TYPES REGISTRY //
    ////////////////////

    /// @notice Adds a set of new position types
    /// @param _labels Labels for each new position type
    function addNewPositionTypes(string[] calldata _labels) external onlyDispatcherOwner {
        for (uint256 i; i < _labels.length; i++) {
            uint256 typeId = getPositionTypeCounter();
            positionTypeCounter++;

            positionTypeIdToLabel[typeId] = _labels[i];

            emit PositionTypeAdded(typeId, _labels[i]);
        }
    }

    /// @notice Updates a set of position type labels
    /// @param _typeIds The position type ids
    /// @param _labels The updated labels
    function updatePositionTypeLabels(uint256[] calldata _typeIds, string[] calldata _labels)
        external
        onlyDispatcherOwner
    {
        require(_typeIds.length == _labels.length, "updatePositionTypeLabels: Unequal arrays");
        for (uint256 i; i < _typeIds.length; i++) {
            positionTypeIdToLabel[_typeIds[i]] = _labels[i];

            emit PositionTypeLabelUpdated(_typeIds[i], _labels[i]);
        }
    }

    /////////////////////////////////
    // POSITION DEPLOYERS REGISTRY //
    /////////////////////////////////

    /// @notice Adds a set of new position deployers
    /// @param _accounts Accounts to be added as position deployers
    function addPositionDeployers(address[] memory _accounts) external onlyDispatcherOwner {
        for (uint256 i; i < _accounts.length; i++) {
            require(
                !isPositionDeployer(_accounts[i]),
                "addPositionDeployers: Account is already a position deployer"
            );

            accountToIsPositionDeployer[_accounts[i]] = true;

            emit PositionDeployerAdded(_accounts[i]);
        }
    }

    /// @notice Removes a set of existing position deployers
    /// @param _accounts Existing position deployers to be removed from their role
    function removePositionDeployers(address[] memory _accounts) external onlyDispatcherOwner {
        for (uint256 i; i < _accounts.length; i++) {
            require(
                isPositionDeployer(_accounts[i]),
                "removePositionDeployers: Account is not a position deployer"
            );

            accountToIsPositionDeployer[_accounts[i]] = false;

            emit PositionDeployerRemoved(_accounts[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Gets the label for a position type
    /// @param _typeId The position type id
    /// @return label_ The label
    function getLabelForPositionType(uint256 _typeId)
        external
        view
        returns (string memory label_)
    {
        return positionTypeIdToLabel[_typeId];
    }

    /// @notice Checks if an account is an external position proxy
    /// @param _account The account to check
    /// @return isExternalPositionProxy_ True if the account is an externalPositionProxy
    function isExternalPositionProxy(address _account)
        external
        view
        returns (bool isExternalPositionProxy_)
    {
        return accountToIsExternalPositionProxy[_account];
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the `DISPATCHER` variable
    /// @return dispatcher_ The `DISPATCHER` variable value
    function getDispatcher() public view returns (address dispatcher_) {
        return DISPATCHER;
    }

    /// @notice Gets the `positionTypeCounter` variable
    /// @return positionTypeCounter_ The `positionTypeCounter` variable value
    function getPositionTypeCounter() public view returns (uint256 positionTypeCounter_) {
        return positionTypeCounter;
    }

    /// @notice Checks if an account is a position deployer
    /// @param _account The account to check
    /// @return isPositionDeployer_ True if the account is a position deployer
    function isPositionDeployer(address _account) public view returns (bool isPositionDeployer_) {
        return accountToIsPositionDeployer[_account];
    }
}
