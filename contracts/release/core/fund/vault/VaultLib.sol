// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../../persistent/dispatcher/IDispatcher.sol";
import "../../../../persistent/vault/VaultLibBase2.sol";
import "../../../interfaces/IWETH.sol";
import "../comptroller/IComptroller.sol";
import "../debt-positions/IDebtPosition.sol";
import "./IVault.sol";

/// @title VaultLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The per-release proxiable library contract for VaultProxy
/// @dev The difference in terminology between "asset" and "trackedAsset" is intentional.
/// A fund might actually have asset balances of un-tracked assets,
/// but only tracked assets are used in gav calculations.
/// Note that this contract inherits VaultLibSafeMath (a verbatim Open Zeppelin SafeMath copy)
/// from SharesTokenBase via VaultLibBase2
contract VaultLib is VaultLibBase2, IVault {
    using SafeERC20 for ERC20;

    // Before updating TRACKED_ASSETS_LIMIT in the future, it is important to consider:
    // 1. The highest tracked assets limit ever allowed in the protocol
    // 2. That the next value will need to be respected by all future releases
    uint256 private constant TRACKED_ASSETS_LIMIT = 20;

    address private immutable WETH_TOKEN;

    modifier notShares(address _asset) {
        require(_asset != address(this), "Cannot act on shares");
        _;
    }

    modifier onlyAccessor() {
        require(msg.sender == accessor, "Only the designated accessor can make this call");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this function");
        _;
    }

    constructor(address _weth) public {
        WETH_TOKEN = _weth;
    }

    /// @dev If a VaultProxy receives ETH, immediately wrap into WETH.
    /// Will not be able to receive ETH via .transfer() or .send() due to limited gas forwarding.
    receive() external payable {
        IWETH(payable(WETH_TOKEN)).deposit{value: payable(address(this)).balance}();
    }

    ////////////////////////
    // PERMISSIONED ROLES //
    ////////////////////////

    /// @notice Claim ownership of the contract
    function claimOwnership() external {
        address nextOwner = nominatedOwner;
        require(
            msg.sender == nextOwner,
            "claimOwnership: Only the nominatedOwner can call this function"
        );

        delete nominatedOwner;

        address prevOwner = owner;
        owner = nextOwner;

        emit OwnershipTransferred(prevOwner, nextOwner);
    }

    /// @notice Revoke the nomination of a new contract owner
    function removeNominatedOwner() external onlyOwner {
        address removedNominatedOwner = nominatedOwner;
        require(
            removedNominatedOwner != address(0),
            "removeNominatedOwner: There is no nominated owner"
        );

        delete nominatedOwner;

        emit NominatedOwnerRemoved(removedNominatedOwner);
    }

    /// @notice Sets the account that is allowed to migrate a fund to new releases
    /// @param _nextMigrator The account to set as the allowed migrator
    /// @dev Set to address(0) to remove the migrator.
    function setMigrator(address _nextMigrator) external onlyOwner {
        address prevMigrator = migrator;
        require(_nextMigrator != prevMigrator, "setMigrator: Value already set");

        migrator = _nextMigrator;

        emit MigratorSet(prevMigrator, _nextMigrator);
    }

    /// @notice Nominate a new contract owner
    /// @param _nextNominatedOwner The account to nominate
    /// @dev Does not prohibit overwriting the current nominatedOwner
    function setNominatedOwner(address _nextNominatedOwner) external onlyOwner {
        require(
            _nextNominatedOwner != address(0),
            "setNominatedOwner: _nextNominatedOwner cannot be empty"
        );
        require(
            _nextNominatedOwner != owner,
            "setNominatedOwner: _nextNominatedOwner is already the owner"
        );
        require(
            _nextNominatedOwner != nominatedOwner,
            "setNominatedOwner: _nextNominatedOwner is already nominated"
        );

        nominatedOwner = _nextNominatedOwner;

        emit NominatedOwnerSet(_nextNominatedOwner);
    }

    ///////////////////////////////////////
    // ACCESSOR (COMPTROLLER PROXY) ONLY //
    ///////////////////////////////////////

    /// @notice Adds a tracked asset and sets it as persistently tracked
    /// @param _asset The asset to add and set as persistently tracked
    function addPersistentlyTrackedAsset(address _asset) external override onlyAccessor {
        __addPersistentlyTrackedAsset(_asset);
    }

    /// @notice Allows specified assets to be untracked, unsetting them as persistently tracked
    /// @param _assets The asset to allow to untrack
    /// @dev Generally unnecessary to call directly, but closes a potential griefing attack
    function allowUntrackingAssets(address[] memory _assets) external override onlyAccessor {
        for (uint256 i; i < _assets.length; i++) {
            __unsetPersistentlyTrackedAsset(_assets[i]);
        }
    }

    /// @notice Burns fund shares from a particular account
    /// @param _target The account for which to burn shares
    /// @param _amount The amount of shares to burn
    function burnShares(address _target, uint256 _amount) external override onlyAccessor {
        __burn(_target, _amount);
    }

    /// @notice Makes an arbitrary call with this contract as the sender
    /// @param _contract The contract to call
    /// @param _callData The call data for the call
    function callOnContract(address _contract, bytes calldata _callData)
        external
        override
        onlyAccessor
    {
        (bool success, bytes memory returnData) = _contract.call(_callData);
        require(success, string(returnData));
    }

    /// @notice Mints fund shares to a particular account
    /// @param _target The account for which to burn shares
    /// @param _amount The amount of shares to mint
    function mintShares(address _target, uint256 _amount) external override onlyAccessor {
        __mint(_target, _amount);
    }

    /// @notice Removes a tracked asset
    /// @param _asset The asset to remove as a tracked asset
    function removeTrackedAsset(address _asset) external override onlyAccessor {
        __removeTrackedAsset(_asset);
    }

    /// @notice Transfers fund shares from one account to another
    /// @param _from The account from which to transfer shares
    /// @param _to The account to which to transfer shares
    /// @param _amount The amount of shares to transfer
    /// @dev For protocol use only, all other transfers should operate
    /// via standard ERC20 functions
    function transferShares(
        address _from,
        address _to,
        uint256 _amount
    ) external override onlyAccessor {
        __transfer(_from, _to, _amount);
    }

    /// @notice Withdraws an asset from the VaultProxy to a given account
    /// @param _asset The asset to withdraw
    /// @param _target The account to which to withdraw the asset
    /// @param _amount The amount of asset to withdraw
    function withdrawAssetTo(
        address _asset,
        address _target,
        uint256 _amount
    ) external override onlyAccessor {
        __withdrawAssetTo(_asset, _target, _amount);
    }

    ///////////////////////////
    // VAULT ACTION DISPATCH //
    ///////////////////////////

    /// @notice Dispatches a call initiated from an Extension, validated by the ComptrollerProxy
    /// @param _action The VaultAction to perform
    /// @param _actionData The call data for the action to perform
    function receiveValidatedVaultAction(VaultAction _action, bytes calldata _actionData)
        external
        override
        onlyAccessor
    {
        if (_action == VaultAction.AddDebtPosition) {
            __executeVaultActionAddDebtPosition(_actionData);
        } else if (_action == VaultAction.AddPersistentlyTrackedAsset) {
            __executeVaultActionAddPersistentlyTrackedAsset(_actionData);
        } else if (_action == VaultAction.AddTrackedAsset) {
            __executeVaultActionAddTrackedAsset(_actionData);
        } else if (_action == VaultAction.ApproveAssetSpender) {
            __executeVaultActionApproveAssetSpender(_actionData);
        } else if (_action == VaultAction.BurnShares) {
            __executeVaultActionBurnShares(_actionData);
        } else if (_action == VaultAction.CallOnDebtPosition) {
            __executeVaultActionCallOnDebtPosition(_actionData);
        } else if (_action == VaultAction.MintShares) {
            __executeVaultActionMintShares(_actionData);
        } else if (_action == VaultAction.RemoveDebtPosition) {
            __executeVaultActionRemoveDebtPosition(_actionData);
        } else if (_action == VaultAction.RemovePersistentlyTrackedAsset) {
            __executeVaultActionRemovePersistentlyTrackedAsset(_actionData);
        } else if (_action == VaultAction.RemoveTrackedAsset) {
            __executeVaultActionRemoveTrackedAsset(_actionData);
        } else if (_action == VaultAction.TransferShares) {
            __executeVaultActionTransferShares(_actionData);
        } else if (_action == VaultAction.WithdrawAssetTo) {
            __executeVaultActionWithdrawAssetTo(_actionData);
        }
    }

    /// @dev Helper to decode actionData and execute VaultAction.AddDebtPosition
    function __executeVaultActionAddDebtPosition(bytes memory _actionData) private {
        __addDebtPosition(abi.decode(_actionData, (address)));
    }

    /// @dev Helper to decode actionData and execute VaultAction.AddPersistentlyTrackedAsset
    function __executeVaultActionAddPersistentlyTrackedAsset(bytes memory _actionData) private {
        __addPersistentlyTrackedAsset(abi.decode(_actionData, (address)));
    }

    /// @dev Helper to decode actionData and execute VaultAction.AddTrackedAsset
    function __executeVaultActionAddTrackedAsset(bytes memory _actionData) private {
        __addTrackedAsset(abi.decode(_actionData, (address)));
    }

    /// @dev Helper to decode actionData and execute VaultAction.ApproveAssetSpender
    function __executeVaultActionApproveAssetSpender(bytes memory _actionData) private {
        (address asset, address target, uint256 amount) = abi.decode(
            _actionData,
            (address, address, uint256)
        );

        __approveAssetSpender(asset, target, amount);
    }

    /// @dev Helper to decode actionData and execute VaultAction.BurnShares
    function __executeVaultActionBurnShares(bytes memory _actionData) private {
        (address target, uint256 amount) = abi.decode(_actionData, (address, uint256));

        __burn(target, amount);
    }

    /// @dev Helper to decode actionData and execute VaultAction.CallOnDebtPosition
    function __executeVaultActionCallOnDebtPosition(bytes memory _actionData) private {
        (
            address debtPosition,
            bytes memory callOnDebtPositionActionData,
            address[] memory assetsToTransfer,
            uint256[] memory amountsToTransfer,
            address[] memory assetsToReceive
        ) = abi.decode(_actionData, (address, bytes, address[], uint256[], address[]));

        __callOnDebtPosition(
            debtPosition,
            callOnDebtPositionActionData,
            assetsToTransfer,
            amountsToTransfer,
            assetsToReceive
        );
    }

    /// @dev Helper to decode actionData and execute VaultAction.MintShares
    function __executeVaultActionMintShares(bytes memory _actionData) private {
        (address target, uint256 amount) = abi.decode(_actionData, (address, uint256));

        __mint(target, amount);
    }

    /// @dev Helper to decode actionData and execute VaultAction.RemoveDebtPosition
    function __executeVaultActionRemoveDebtPosition(bytes memory _actionData) private {
        __removeDebtPosition(abi.decode(_actionData, (address)));
    }

    /// @dev Helper to decode actionData and execute VaultAction.RemovePersistentlyTrackedAsset
    function __executeVaultActionRemovePersistentlyTrackedAsset(bytes memory _actionData) private {
        __removePersistentlyTrackedAsset(abi.decode(_actionData, (address)));
    }

    /// @dev Helper to decode actionData and execute VaultAction.RemoveTrackedAsset
    function __executeVaultActionRemoveTrackedAsset(bytes memory _actionData) private {
        __removeTrackedAsset(abi.decode(_actionData, (address)));
    }

    /// @dev Helper to decode actionData and execute VaultAction.TransferShares
    function __executeVaultActionTransferShares(bytes memory _actionData) private {
        (address from, address to, uint256 amount) = abi.decode(
            _actionData,
            (address, address, uint256)
        );

        __transfer(from, to, amount);
    }

    /// @dev Helper to decode actionData and execute VaultAction.WithdrawAssetTo
    function __executeVaultActionWithdrawAssetTo(bytes memory _actionData) private {
        (address asset, address target, uint256 amount) = abi.decode(
            _actionData,
            (address, address, uint256)
        );

        __withdrawAssetTo(asset, target, amount);
    }

    ///////////////////
    // VAULT ACTIONS //
    ///////////////////

    /// @dev Helper to track a new active debt position
    // TODO: Decide whether or not it makes sense to impose a debt position limit
    function __addDebtPosition(address _debtPosition) private {
        if (!isActiveDebtPosition(_debtPosition)) {
            debtPositionToIsActive[_debtPosition] = true;
            activeDebtPositions.push(_debtPosition);
        }

        emit DebtPositionAdded(_debtPosition);
    }

    /// @dev Helper to add and persistently track an asset
    function __addPersistentlyTrackedAsset(address _asset) private {
        __setPersistentlyTrackedAsset(_asset);
        __addTrackedAsset(_asset);
    }

    /// @dev Helper to add a tracked asset
    function __addTrackedAsset(address _asset) private notShares(_asset) {
        if (!isTrackedAsset(_asset)) {
            require(
                trackedAssets.length < TRACKED_ASSETS_LIMIT,
                "__addTrackedAsset: Limit exceeded"
            );

            assetToIsTracked[_asset] = true;
            trackedAssets.push(_asset);

            emit TrackedAssetAdded(_asset);
        }
    }

    /// @dev Helper to grant an allowance to a spender to use a vault asset
    function __approveAssetSpender(
        address _asset,
        address _target,
        uint256 _amount
    ) private notShares(_asset) {
        ERC20 assetContract = ERC20(_asset);
        if (assetContract.balanceOf(_target) > 0) {
            assetContract.safeApprove(_target, 0);
        }
        assetContract.safeApprove(_target, _amount);
    }

    /// @dev Helper to make a call on a debt position contract
    /// @param _debtPosition The debt position to call
    /// @param _actionData The action data for the call
    /// @param _assetsToTransfer The assets to transfer to the debt position
    /// @param _amountsToTransfer The amount of assets to be transferred to the debt position
    /// @param _assetsToReceive The assets that will be received from the call
    function __callOnDebtPosition(
        address _debtPosition,
        bytes memory _actionData,
        address[] memory _assetsToTransfer,
        uint256[] memory _amountsToTransfer,
        address[] memory _assetsToReceive
    ) private {
        for (uint256 i; i < _assetsToTransfer.length; i++) {
            __withdrawAssetTo(_assetsToTransfer[i], _debtPosition, _amountsToTransfer[i]);
        }

        IDebtPosition(_debtPosition).receiveCallFromVault(_actionData);

        for (uint256 i; i < _assetsToReceive.length; i++) {
            __addTrackedAsset(_assetsToReceive[i]);
        }
    }

    /// @dev Helper to the get the Vault's balance of a given asset
    function __getAssetBalance(address _asset) private view returns (uint256 balance_) {
        return ERC20(_asset).balanceOf(address(this));
    }

    /// @dev Helper to remove a debt position from the vault
    function __removeDebtPosition(address _debtPosition) private {
        if (isActiveDebtPosition(_debtPosition)) {
            debtPositionToIsActive[_debtPosition] = false;

            uint256 debtPositionsCount = activeDebtPositions.length;
            for (uint256 i; i < debtPositionsCount; i++) {
                if (activeDebtPositions[i] == _debtPosition) {
                    if (i < debtPositionsCount - 1) {
                        activeDebtPositions[i] = activeDebtPositions[debtPositionsCount - 1];
                    }
                    activeDebtPositions.pop();
                    break;
                }
            }

            emit DebtPositionRemoved(_debtPosition);
        }
    }

    /// @dev Helper to unset and remove a persistently tracked asset
    function __removePersistentlyTrackedAsset(address _asset) private {
        __unsetPersistentlyTrackedAsset(_asset);
        __removeTrackedAsset(_asset);
    }

    /// @dev Helper to remove a tracked asset
    function __removeTrackedAsset(address _asset) private {
        if (isTrackedAsset(_asset) && !isPersistentlyTrackedAsset(_asset)) {
            assetToIsTracked[_asset] = false;

            uint256 trackedAssetsCount = trackedAssets.length;
            for (uint256 i; i < trackedAssetsCount; i++) {
                if (trackedAssets[i] == _asset) {
                    if (i < trackedAssetsCount - 1) {
                        trackedAssets[i] = trackedAssets[trackedAssetsCount - 1];
                    }
                    trackedAssets.pop();
                    break;
                }
            }

            emit TrackedAssetRemoved(_asset);
        }
    }

    /// @dev Helper to add asset to the list of assets that cannot be untracked
    function __setPersistentlyTrackedAsset(address _asset) private {
        if (!isPersistentlyTrackedAsset(_asset)) {
            assetToIsPersistentlyTracked[_asset] = true;

            emit PersistentlyTrackedAssetAdded(_asset);
        }
    }

    /// @dev Helper to remove assets from the list of assets that cannot be untracked
    function __unsetPersistentlyTrackedAsset(address _asset) private {
        if (isPersistentlyTrackedAsset(_asset)) {
            assetToIsPersistentlyTracked[_asset] = false;

            emit PersistentlyTrackedAssetRemoved(_asset);
        }
    }

    /// @dev Helper to withdraw an asset from the vault to a specified recipient
    function __withdrawAssetTo(
        address _asset,
        address _target,
        uint256 _amount
    ) private notShares(_asset) {
        ERC20(_asset).safeTransfer(_target, _amount);

        emit AssetWithdrawn(_asset, _target, _amount);

        if (__getAssetBalance(_asset) == 0) {
            __removeTrackedAsset(_asset);
        }
    }

    ////////////////////////////
    // SHARES ERC20 OVERRIDES //
    ////////////////////////////

    /// @notice Gets the `symbol` value of the shares token
    /// @return symbol_ The `symbol` value
    /// @dev Defers the shares symbol value to the Dispatcher contract
    function symbol() public view override returns (string memory symbol_) {
        return IDispatcher(creator).getSharesTokenSymbol();
    }

    /// @dev Standard implementation of ERC20's transfer().
    /// Overridden to allow arbitrary logic in ComptrollerProxy prior to transfer.
    function transfer(address _recipient, uint256 _amount) public override returns (bool) {
        IComptroller(accessor).preTransferSharesHook(msg.sender, _recipient, _amount);

        return super.transfer(_recipient, _amount);
    }

    /// @dev Standard implementation of ERC20's transferFrom().
    /// Overridden to allow arbitrary logic in ComptrollerProxy prior to transfer.
    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public override returns (bool) {
        IComptroller(accessor).preTransferSharesHook(_sender, _recipient, _amount);

        return super.transferFrom(_sender, _recipient, _amount);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `accessor` variable
    /// @return accessor_ The `accessor` variable value
    function getAccessor() external view override returns (address accessor_) {
        return accessor;
    }

    /// @notice Gets the `creator` variable
    /// @return creator_ The `creator` variable value
    function getCreator() external view returns (address creator_) {
        return creator;
    }

    /// @notice Gets the `migrator` variable
    /// @return migrator_ The `migrator` variable value
    function getMigrator() external view returns (address migrator_) {
        return migrator;
    }

    /// @notice Gets the account that is nominated to be the next owner of this contract
    /// @return nominatedOwner_ The account that is nominated to be the owner
    function getNominatedOwner() external view returns (address nominatedOwner_) {
        return nominatedOwner;
    }

    /// @notice Gets the `owner` variable
    /// @return owner_ The `owner` variable value
    function getOwner() external view override returns (address owner_) {
        return owner;
    }

    /// @notice Gets the `debtPositions` variable
    /// @return debtPositions_ The `debtPositions` variable value
    function getActiveDebtPositions()
        external
        view
        override
        returns (address[] memory debtPositions_)
    {
        return activeDebtPositions;
    }

    /// @notice Gets the `trackedAssets` variable
    /// @return trackedAssets_ The `trackedAssets` variable value
    function getTrackedAssets() external view override returns (address[] memory trackedAssets_) {
        return trackedAssets;
    }

    /// @notice Check whether a debt position is active on the vault
    /// @param _debtPosition The debtPosition to check
    /// @return isActiveDebtPosition_ True if the address is an active debt position on the vault
    function isActiveDebtPosition(address _debtPosition)
        public
        view
        override
        returns (bool isActiveDebtPosition_)
    {
        return debtPositionToIsActive[_debtPosition];
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether an asset is persistently tracked (i.e., it cannot be untracked)
    /// @param _asset The address to check
    /// @return isPersistentlyTrackedAsset_ True if the asset is persistently tracked
    function isPersistentlyTrackedAsset(address _asset)
        public
        view
        returns (bool isPersistentlyTrackedAsset_)
    {
        return assetToIsPersistentlyTracked[_asset];
    }

    /// @notice Checks whether an address is a tracked asset of the vault
    /// @param _asset The address to check
    /// @return isTrackedAsset_ True if the address is a tracked asset
    function isTrackedAsset(address _asset) public view override returns (bool isTrackedAsset_) {
        return assetToIsTracked[_asset];
    }
}
