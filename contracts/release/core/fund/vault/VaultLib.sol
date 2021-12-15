// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../../persistent/dispatcher/IDispatcher.sol";
import "../../../../persistent/external-positions/IExternalPosition.sol";
import "../../../../persistent/protocol-fee-reserve/interfaces/IProtocolFeeReserve1.sol";
import "../../../../persistent/vault/VaultLibBase2.sol";
import "../../../infrastructure/gas-relayer/GasRelayRecipientMixin.sol";
import "../../../infrastructure/protocol-fees/IProtocolFeeTracker.sol";
import "../../../extensions/external-position-manager/IExternalPositionManager.sol";
import "../../../interfaces/IWETH.sol";
import "../../../utils/AddressArrayLib.sol";
import "../comptroller/IComptroller.sol";
import "./IVault.sol";

/// @title VaultLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The per-release proxiable library contract for VaultProxy
/// @dev The difference in terminology between "asset" and "trackedAsset" is intentional.
/// A fund might actually have asset balances of un-tracked assets,
/// but only tracked assets are used in gav calculations.
/// Note that this contract inherits VaultLibSafeMath (a verbatim Open Zeppelin SafeMath copy)
/// from SharesTokenBase via VaultLibBase2
contract VaultLib is VaultLibBase2, IVault, GasRelayRecipientMixin {
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;

    // "Positions" are "tracked assets" + active "external positions"
    // Before updating POSITIONS_LIMIT in the future, it is important to consider:
    // 1. The highest positions limit ever allowed in the protocol
    // 2. That the next value will need to be respected by all future releases
    uint256 private constant POSITIONS_LIMIT = 20;

    address private immutable EXTERNAL_POSITION_MANAGER;
    address private immutable MLN_TOKEN;
    address private immutable PROTOCOL_FEE_RESERVE;
    address private immutable PROTOCOL_FEE_TRACKER;
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
        require(__msgSender() == owner, "Only the owner can call this function");
        _;
    }

    constructor(
        address _externalPositionManager,
        address _gasRelayPaymasterFactory,
        address _protocolFeeReserve,
        address _protocolFeeTracker,
        address _mlnToken,
        address _wethToken
    ) public GasRelayRecipientMixin(_gasRelayPaymasterFactory) {
        EXTERNAL_POSITION_MANAGER = _externalPositionManager;
        MLN_TOKEN = _mlnToken;
        PROTOCOL_FEE_RESERVE = _protocolFeeReserve;
        PROTOCOL_FEE_TRACKER = _protocolFeeTracker;
        WETH_TOKEN = _wethToken;
    }

    /// @dev If a VaultProxy receives ETH, immediately wrap into WETH.
    /// Will not be able to receive ETH via .transfer() or .send() due to limited gas forwarding.
    receive() external payable {
        uint256 ethAmount = payable(address(this)).balance;
        IWETH(payable(getWethToken())).deposit{value: ethAmount}();

        emit EthReceived(msg.sender, ethAmount);
    }

    /////////////
    // GENERAL //
    /////////////

    /// @notice Gets the external position library contract for a given type
    /// @param _typeId The type for which to get the external position library
    /// @return externalPositionLib_ The external position library
    function getExternalPositionLibForType(uint256 _typeId)
        external
        view
        override
        returns (address externalPositionLib_)
    {
        return
            IExternalPositionManager(getExternalPositionManager()).getExternalPositionLibForType(
                _typeId
            );
    }

    /// @notice Sets shares as (permanently) freely transferable
    /// @dev Once set, this can never be allowed to be unset, as it provides a critical
    /// transferability guarantee to liquidity pools and other smart contract holders
    /// that rely on transfers to function properly. Enabling this option will skip all
    /// policies run upon transferring shares, but will still respect the shares action timelock.
    function setFreelyTransferableShares() external onlyOwner {
        require(!sharesAreFreelyTransferable(), "setFreelyTransferableShares: Already set");

        freelyTransferableShares = true;

        emit FreelyTransferableSharesSet();
    }

    /// @notice Sets the shares name
    /// @param _nextName The next name value
    /// @dev Owners should consider the implications of changing an ERC20 name post-deployment,
    /// e.g., some apps/dapps may cache token names for display purposes, so changing the name
    /// in contract state may not be reflected in third party applications as desired.
    function setName(string calldata _nextName) external onlyOwner {
        sharesName = _nextName;

        emit NameSet(_nextName);
    }

    /// @notice Sets the shares token symbol
    /// @param _nextSymbol The next symbol value
    /// @dev Owners should consider the implications of changing an ERC20 symbol post-deployment,
    /// e.g., some apps/dapps may cache token symbols for display purposes, so changing the symbol
    /// in contract state may not be reflected in third party applications as desired.
    /// Only callable by the FundDeployer during vault creation or by the vault owner.
    function setSymbol(string calldata _nextSymbol) external override {
        require(__msgSender() == owner || msg.sender == getFundDeployer(), "Unauthorized");

        sharesSymbol = _nextSymbol;

        emit SymbolSet(_nextSymbol);
    }

    ////////////////////////
    // PERMISSIONED ROLES //
    ////////////////////////

    /// @notice Registers accounts that can manage vault holdings within the protocol
    /// @param _managers The accounts to add as asset managers
    function addAssetManagers(address[] calldata _managers) external onlyOwner {
        for (uint256 i; i < _managers.length; i++) {
            require(!isAssetManager(_managers[i]), "addAssetManagers: Manager already registered");

            accountToIsAssetManager[_managers[i]] = true;

            emit AssetManagerAdded(_managers[i]);
        }
    }

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

    /// @notice Deregisters accounts that can manage vault holdings within the protocol
    /// @param _managers The accounts to remove as asset managers
    function removeAssetManagers(address[] calldata _managers) external onlyOwner {
        for (uint256 i; i < _managers.length; i++) {
            require(isAssetManager(_managers[i]), "removeAssetManagers: Manager not registered");

            accountToIsAssetManager[_managers[i]] = false;

            emit AssetManagerRemoved(_managers[i]);
        }
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

    ////////////////////////
    // FUND DEPLOYER ONLY //
    ////////////////////////

    /// @notice Updates the accessor during a config change within this release
    /// @param _nextAccessor The next accessor
    function setAccessorForFundReconfiguration(address _nextAccessor) external override {
        require(msg.sender == getFundDeployer(), "Only the FundDeployer can make this call");

        __setAccessor(_nextAccessor);
    }

    ///////////////////////////////////////
    // ACCESSOR (COMPTROLLER PROXY) ONLY //
    ///////////////////////////////////////

    /// @notice Adds a tracked asset
    /// @param _asset The asset to add as a tracked asset
    function addTrackedAsset(address _asset) external override onlyAccessor {
        __addTrackedAsset(_asset);
    }

    /// @notice Burns fund shares from a particular account
    /// @param _target The account for which to burn shares
    /// @param _amount The amount of shares to burn
    function burnShares(address _target, uint256 _amount) external override onlyAccessor {
        __burn(_target, _amount);
    }

    /// @notice Buys back shares collected as protocol fee at a discounted shares price, using MLN
    /// @param _sharesAmount The amount of shares to buy back
    /// @param _mlnValue The MLN-denominated market value of _sharesAmount
    /// @param _gav The total fund GAV
    /// @dev Since the vault controls both the MLN to burn and the admin function to burn any user's
    /// fund shares, there is no need to transfer assets back-and-forth with the ProtocolFeeReserve.
    /// We only need to know the correct discounted amount of MLN to burn.
    function buyBackProtocolFeeShares(
        uint256 _sharesAmount,
        uint256 _mlnValue,
        uint256 _gav
    ) external override onlyAccessor {
        uint256 mlnAmountToBurn = IProtocolFeeReserve1(getProtocolFeeReserve())
            .buyBackSharesViaTrustedVaultProxy(_sharesAmount, _mlnValue, _gav);

        if (mlnAmountToBurn == 0) {
            return;
        }

        // Burn shares and MLN amounts
        // If shares or MLN balance is insufficient, will revert
        __burn(getProtocolFeeReserve(), _sharesAmount);
        ERC20Burnable(getMlnToken()).burn(mlnAmountToBurn);

        emit ProtocolFeeSharesBoughtBack(_sharesAmount, _mlnValue, mlnAmountToBurn);
    }

    /// @notice Makes an arbitrary call with this contract as the sender
    /// @param _contract The contract to call
    /// @param _callData The call data for the call
    /// @return returnData_ The data returned by the call
    function callOnContract(address _contract, bytes calldata _callData)
        external
        override
        onlyAccessor
        returns (bytes memory returnData_)
    {
        bool success;
        (success, returnData_) = _contract.call(_callData);
        require(success, string(returnData_));

        return returnData_;
    }

    /// @notice Mints fund shares to a particular account
    /// @param _target The account for which to burn shares
    /// @param _amount The amount of shares to mint
    function mintShares(address _target, uint256 _amount) external override onlyAccessor {
        __mint(_target, _amount);
    }

    /// @notice Pays the due protocol fee by minting shares to the ProtocolFeeReserve
    function payProtocolFee() external override onlyAccessor {
        uint256 sharesDue = IProtocolFeeTracker(getProtocolFeeTracker()).payFee();

        if (sharesDue == 0) {
            return;
        }

        __mint(getProtocolFeeReserve(), sharesDue);

        emit ProtocolFeePaidInShares(sharesDue);
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
        if (_action == VaultAction.AddExternalPosition) {
            __executeVaultActionAddExternalPosition(_actionData);
        } else if (_action == VaultAction.AddTrackedAsset) {
            __executeVaultActionAddTrackedAsset(_actionData);
        } else if (_action == VaultAction.ApproveAssetSpender) {
            __executeVaultActionApproveAssetSpender(_actionData);
        } else if (_action == VaultAction.BurnShares) {
            __executeVaultActionBurnShares(_actionData);
        } else if (_action == VaultAction.CallOnExternalPosition) {
            __executeVaultActionCallOnExternalPosition(_actionData);
        } else if (_action == VaultAction.MintShares) {
            __executeVaultActionMintShares(_actionData);
        } else if (_action == VaultAction.RemoveExternalPosition) {
            __executeVaultActionRemoveExternalPosition(_actionData);
        } else if (_action == VaultAction.RemoveTrackedAsset) {
            __executeVaultActionRemoveTrackedAsset(_actionData);
        } else if (_action == VaultAction.TransferShares) {
            __executeVaultActionTransferShares(_actionData);
        } else if (_action == VaultAction.WithdrawAssetTo) {
            __executeVaultActionWithdrawAssetTo(_actionData);
        }
    }

    /// @dev Helper to decode actionData and execute VaultAction.AddExternalPosition
    function __executeVaultActionAddExternalPosition(bytes memory _actionData) private {
        __addExternalPosition(abi.decode(_actionData, (address)));
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

    /// @dev Helper to decode actionData and execute VaultAction.CallOnExternalPosition
    function __executeVaultActionCallOnExternalPosition(bytes memory _actionData) private {
        (
            address externalPosition,
            bytes memory callOnExternalPositionActionData,
            address[] memory assetsToTransfer,
            uint256[] memory amountsToTransfer,
            address[] memory assetsToReceive
        ) = abi.decode(_actionData, (address, bytes, address[], uint256[], address[]));

        __callOnExternalPosition(
            externalPosition,
            callOnExternalPositionActionData,
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

    /// @dev Helper to decode actionData and execute VaultAction.RemoveExternalPosition
    function __executeVaultActionRemoveExternalPosition(bytes memory _actionData) private {
        __removeExternalPosition(abi.decode(_actionData, (address)));
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

    /// @dev Helper to track a new active external position
    function __addExternalPosition(address _externalPosition) private {
        if (!isActiveExternalPosition(_externalPosition)) {
            __validatePositionsLimit();

            externalPositionToIsActive[_externalPosition] = true;
            activeExternalPositions.push(_externalPosition);

            emit ExternalPositionAdded(_externalPosition);
        }
    }

    /// @dev Helper to add a tracked asset
    function __addTrackedAsset(address _asset) private notShares(_asset) {
        if (!isTrackedAsset(_asset)) {
            __validatePositionsLimit();

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
        if (assetContract.allowance(address(this), _target) > 0) {
            assetContract.safeApprove(_target, 0);
        }
        assetContract.safeApprove(_target, _amount);
    }

    /// @dev Helper to make a call on a external position contract
    /// @param _externalPosition The external position to call
    /// @param _actionData The action data for the call
    /// @param _assetsToTransfer The assets to transfer to the external position
    /// @param _amountsToTransfer The amount of assets to be transferred to the external position
    /// @param _assetsToReceive The assets that will be received from the call
    function __callOnExternalPosition(
        address _externalPosition,
        bytes memory _actionData,
        address[] memory _assetsToTransfer,
        uint256[] memory _amountsToTransfer,
        address[] memory _assetsToReceive
    ) private {
        require(
            isActiveExternalPosition(_externalPosition),
            "__callOnExternalPosition: Not an active external position"
        );

        for (uint256 i; i < _assetsToTransfer.length; i++) {
            __withdrawAssetTo(_assetsToTransfer[i], _externalPosition, _amountsToTransfer[i]);
        }

        IExternalPosition(_externalPosition).receiveCallFromVault(_actionData);

        for (uint256 i; i < _assetsToReceive.length; i++) {
            __addTrackedAsset(_assetsToReceive[i]);
        }
    }

    /// @dev Helper to the get the Vault's balance of a given asset
    function __getAssetBalance(address _asset) private view returns (uint256 balance_) {
        return ERC20(_asset).balanceOf(address(this));
    }

    /// @dev Helper to remove a external position from the vault
    function __removeExternalPosition(address _externalPosition) private {
        if (isActiveExternalPosition(_externalPosition)) {
            externalPositionToIsActive[_externalPosition] = false;

            activeExternalPositions.removeStorageItem(_externalPosition);

            emit ExternalPositionRemoved(_externalPosition);
        }
    }

    /// @dev Helper to remove a tracked asset
    function __removeTrackedAsset(address _asset) private {
        if (isTrackedAsset(_asset)) {
            assetToIsTracked[_asset] = false;

            trackedAssets.removeStorageItem(_asset);

            emit TrackedAssetRemoved(_asset);
        }
    }

    /// @dev Helper to validate that the positions limit has not been reached
    function __validatePositionsLimit() private view {
        require(
            trackedAssets.length + activeExternalPositions.length < POSITIONS_LIMIT,
            "__validatePositionsLimit: Limit exceeded"
        );
    }

    /// @dev Helper to withdraw an asset from the vault to a specified recipient
    function __withdrawAssetTo(
        address _asset,
        address _target,
        uint256 _amount
    ) private notShares(_asset) {
        ERC20(_asset).safeTransfer(_target, _amount);

        emit AssetWithdrawn(_asset, _target, _amount);
    }

    ////////////////////////////
    // SHARES ERC20 OVERRIDES //
    ////////////////////////////

    /// @notice Gets the `symbol` value of the shares token
    /// @return symbol_ The `symbol` value
    /// @dev Defers the shares symbol value to the Dispatcher contract if not set locally
    function symbol() public view override returns (string memory symbol_) {
        symbol_ = sharesSymbol;
        if (bytes(symbol_).length == 0) {
            symbol_ = IDispatcher(creator).getSharesTokenSymbol();
        }

        return symbol_;
    }

    /// @dev Standard implementation of ERC20's transfer().
    /// Overridden to allow arbitrary logic in ComptrollerProxy prior to transfer.
    function transfer(address _recipient, uint256 _amount)
        public
        override
        returns (bool success_)
    {
        __invokePreTransferSharesHook(msg.sender, _recipient, _amount);

        return super.transfer(_recipient, _amount);
    }

    /// @dev Standard implementation of ERC20's transferFrom().
    /// Overridden to allow arbitrary logic in ComptrollerProxy prior to transfer.
    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public override returns (bool success_) {
        __invokePreTransferSharesHook(_sender, _recipient, _amount);

        return super.transferFrom(_sender, _recipient, _amount);
    }

    /// @dev Helper to call the relevant preTransferShares hook
    function __invokePreTransferSharesHook(
        address _sender,
        address _recipient,
        uint256 _amount
    ) private {
        if (sharesAreFreelyTransferable()) {
            IComptroller(accessor).preTransferSharesHookFreelyTransferable(_sender);
        } else {
            IComptroller(accessor).preTransferSharesHook(_sender, _recipient, _amount);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Checks whether an account can manage assets
    /// @param _who The account to check
    /// @return canManageAssets_ True if the account can manage assets
    function canManageAssets(address _who) external view override returns (bool canManageAssets_) {
        return _who == getOwner() || isAssetManager(_who);
    }

    /// @notice Checks whether an account can use gas relaying
    /// @param _who The account to check
    /// @return canRelayCalls_ True if the account can use gas relaying on this fund
    function canRelayCalls(address _who) external view override returns (bool canRelayCalls_) {
        return _who == getOwner() || isAssetManager(_who) || _who == getMigrator();
    }

    /// @notice Gets the `accessor` variable
    /// @return accessor_ The `accessor` variable value
    function getAccessor() public view override returns (address accessor_) {
        return accessor;
    }

    /// @notice Gets the `creator` variable
    /// @return creator_ The `creator` variable value
    function getCreator() external view returns (address creator_) {
        return creator;
    }

    /// @notice Gets the `migrator` variable
    /// @return migrator_ The `migrator` variable value
    function getMigrator() public view returns (address migrator_) {
        return migrator;
    }

    /// @notice Gets the account that is nominated to be the next owner of this contract
    /// @return nominatedOwner_ The account that is nominated to be the owner
    function getNominatedOwner() external view returns (address nominatedOwner_) {
        return nominatedOwner;
    }

    /// @notice Gets the `activeExternalPositions` variable
    /// @return activeExternalPositions_ The `activeExternalPositions` variable value
    function getActiveExternalPositions()
        external
        view
        override
        returns (address[] memory activeExternalPositions_)
    {
        return activeExternalPositions;
    }

    /// @notice Gets the `trackedAssets` variable
    /// @return trackedAssets_ The `trackedAssets` variable value
    function getTrackedAssets() external view override returns (address[] memory trackedAssets_) {
        return trackedAssets;
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the `EXTERNAL_POSITION_MANAGER` variable
    /// @return externalPositionManager_ The `EXTERNAL_POSITION_MANAGER` variable value
    function getExternalPositionManager() public view returns (address externalPositionManager_) {
        return EXTERNAL_POSITION_MANAGER;
    }

    /// @notice Gets the vaults fund deployer
    /// @return fundDeployer_ The fund deployer contract associated with this vault
    function getFundDeployer() public view returns (address fundDeployer_) {
        return IDispatcher(creator).getFundDeployerForVaultProxy(address(this));
    }

    /// @notice Gets the `MLN_TOKEN` variable
    /// @return mlnToken_ The `MLN_TOKEN` variable value
    function getMlnToken() public view returns (address mlnToken_) {
        return MLN_TOKEN;
    }

    /// @notice Gets the `owner` variable
    /// @return owner_ The `owner` variable value
    function getOwner() public view override returns (address owner_) {
        return owner;
    }

    /// @notice Gets the `PROTOCOL_FEE_RESERVE` variable
    /// @return protocolFeeReserve_ The `PROTOCOL_FEE_RESERVE` variable value
    function getProtocolFeeReserve() public view returns (address protocolFeeReserve_) {
        return PROTOCOL_FEE_RESERVE;
    }

    /// @notice Gets the `PROTOCOL_FEE_TRACKER` variable
    /// @return protocolFeeTracker_ The `PROTOCOL_FEE_TRACKER` variable value
    function getProtocolFeeTracker() public view returns (address protocolFeeTracker_) {
        return PROTOCOL_FEE_TRACKER;
    }

    /// @notice Check whether an external position is active on the vault
    /// @param _externalPosition The externalPosition to check
    /// @return isActiveExternalPosition_ True if the address is an active external position on the vault
    function isActiveExternalPosition(address _externalPosition)
        public
        view
        override
        returns (bool isActiveExternalPosition_)
    {
        return externalPositionToIsActive[_externalPosition];
    }

    /// @notice Checks whether an account is an allowed asset manager
    /// @param _who The account to check
    /// @return isAssetManager_ True if the account is an allowed asset manager
    function isAssetManager(address _who) public view returns (bool isAssetManager_) {
        return accountToIsAssetManager[_who];
    }

    /// @notice Checks whether an address is a tracked asset of the vault
    /// @param _asset The address to check
    /// @return isTrackedAsset_ True if the address is a tracked asset
    function isTrackedAsset(address _asset) public view override returns (bool isTrackedAsset_) {
        return assetToIsTracked[_asset];
    }

    /// @notice Checks whether shares are (permanently) freely transferable
    /// @return sharesAreFreelyTransferable_ True if shares are (permanently) freely transferable
    function sharesAreFreelyTransferable()
        public
        view
        override
        returns (bool sharesAreFreelyTransferable_)
    {
        return freelyTransferableShares;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() public view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
