// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {ERC20} from "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import {SafeERC20} from "openzeppelin-solc-0.6/token/ERC20/SafeERC20.sol";
import {IAddressListRegistry} from "../../../../persistent/address-list-registry/IAddressListRegistry.sol";
import {IDispatcher} from "../../../../persistent/dispatcher/IDispatcher.sol";
import {AddressArrayLib} from "../../../../utils/0.6.12/AddressArrayLib.sol";
import {AssetHelpers} from "../../../../utils/0.6.12/AssetHelpers.sol";
import {MathHelpers} from "../../../../utils/0.6.12/MathHelpers.sol";
import {IComptroller} from "../../../core/fund/comptroller/IComptroller.sol";
import {IVault} from "../../../core/fund/vault/IVault.sol";
import {IExternalPosition} from "../../../extensions/external-position-manager/IExternalPosition.sol";

/// @title ArbitraryTokenPhasedSharesWrapperLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An ERC20 wrapper for Enzyme vault shares that facilitates an arbitrary deposit token,
/// using a phased mechanism for accepting deposits and allowing withdrawals
/// @dev This contract is only intended for use by vaults on Enzyme v4, or hotfix releases that
/// maintain the same essential logic and interfaces. Owners should NOT upgrade to a new version
/// of the core protocol while this wrapper is in a non-Redeem state, unless certain that the
/// new version adheres to the same required interfaces and general logical assumptions.
/// Core protocol fees are assumed to be turned off for any vault using this wrapper,
/// which instead applies a protocol fee locally (requires Enzyme Council action). This is due to
/// the challenges of fairly applying the fee on the dilutive mechanism for depositing untracked assets.
/// The owner defers to `VaultProxy.owner`, to maintain the same trust assumptions of the fund.
/// Requires a fund setup where:
/// - the fund owner is trusted by depositors
/// - untrusted asset managers cannot untrack assets or untrack external positions with positive value
/// - all other generally-recommended policies are in-place for limiting untrusted asset manager
/// interactions with adapters and external positions
contract ArbitraryTokenPhasedSharesWrapperLib is ERC20, AssetHelpers, MathHelpers {
    using SafeERC20 for ERC20;
    using AddressArrayLib for address[];

    enum State {
        Deposit,
        Locked,
        Redeem
    }

    event AllowedDepositorListIdSet(uint256 listId);

    event Deposited(address indexed user, uint256 amount);

    event FeePaid(address token, uint256 amount);

    event ProtocolFeePaid(address token, uint256 amount);

    event ProtocolFeeStarted();

    event Initialized(
        address vaultProxy,
        address depositToken,
        bool transfersAllowed,
        address feeRecipient,
        uint16 feeBps,
        bool feeExcludesDepositTokenPrincipal
    );

    event ManagerSet(address manager);

    event StateSet(State state);

    event TotalDepositMaxSet(uint256 totalDepositMax);

    event Withdrawn(address indexed user, uint256 amount, address[] claimedAssets, uint256[] claimedAssetAmounts);

    uint256 private constant MAX_BPS = 10000;
    uint256 private constant SECONDS_IN_YEAR = 31557600; // 60*60*24*365.25

    IAddressListRegistry private immutable ADDRESS_LIST_REGISTRY_CONTRACT;
    IDispatcher private immutable DISPATCHER_CONTRACT;
    address private immutable FUND_DEPLOYER_V4;
    address private immutable INITIALIZER;
    uint256 private immutable PROTOCOL_FEE_BPS;
    address private immutable PROTOCOL_FEE_RECIPIENT;
    address private immutable THIS_LIB;

    address private manager;
    address private vaultProxy;
    // Var-packed
    address private depositToken;
    State private state;
    // Var packed
    // allowedDepositorListId == `0` allows any depositor
    uint128 private allowedDepositorListId;
    // totalDepositMax == `0` is uncapped
    uint128 private totalDepositMax;
    // Var packed
    address private feeRecipient;
    uint32 private protocolFeeStart;
    uint16 private feeBps;
    bool private feeExcludesDepositTokenPrincipal;
    bool private isReentered;
    bool private transfersAllowed;

    address[] private redeemedAssets;

    modifier nonReentrant() {
        require(!isReentered, "nonReentrant: Reentrancy");

        isReentered = true;

        _;

        isReentered = false;
    }

    modifier onlyOwner() {
        require(msg.sender == __getOwnerOfVaultProxy(getVaultProxy()), "onlyOwner: Unauthorized");
        _;
    }

    modifier onlyTransfersAllowed() {
        require(getTransfersAllowed(), "onlyTransfersAllowed: Disallowed");
        _;
    }

    constructor(
        address _dispatcher,
        address _addressListRegistry,
        address _fundDeployerV4,
        address _protocolFeeRecipient,
        uint256 _protocolFeeBps,
        address _initializer
    ) public ERC20("Wrapped Enzyme Shares Lib", "wENZF-lib") {
        ADDRESS_LIST_REGISTRY_CONTRACT = IAddressListRegistry(_addressListRegistry);
        DISPATCHER_CONTRACT = IDispatcher(_dispatcher);
        FUND_DEPLOYER_V4 = _fundDeployerV4;
        INITIALIZER = _initializer;
        PROTOCOL_FEE_BPS = _protocolFeeBps;
        PROTOCOL_FEE_RECIPIENT = _protocolFeeRecipient;
        THIS_LIB = address(this);
    }

    /// @notice Initializes a proxy instance
    /// @param _vaultProxy The VaultProxy that will have its shares wrapped
    /// @param _depositToken The token that users deposit to the wrapper to receive wrapped shares
    /// @param _allowedDepositorListId The id of an AddressListRegistry list to use for validating allowed depositors
    /// @param _transfersAllowed True if wrapped shares transfers are allowed
    /// @param _totalDepositMax The total amount of deposit token that can be deposited
    /// @param _feeRecipient The recipient of the wrapper fee
    /// @param _feeBps The wrapper fee amount in bps
    /// @param _feeExcludesDepositTokenPrincipal True if the fee excludes the total _depositToken amount deposited
    /// @param _manager The manager of the wrapper
    /// @dev Validating via INITIALIZER makes deployments cheaper than checking a storage var,
    /// but INITIALIZER must be trusted to not call more than once.
    function init(
        address _vaultProxy,
        address _depositToken,
        uint128 _allowedDepositorListId,
        bool _transfersAllowed,
        uint128 _totalDepositMax,
        address _feeRecipient,
        uint16 _feeBps,
        bool _feeExcludesDepositTokenPrincipal,
        address _manager
    ) external {
        require(msg.sender == INITIALIZER, "init: Unauthorized");

        // Only allow if the vault is on v4.
        // Also validates that _vaultProxy != address(0).
        require(
            DISPATCHER_CONTRACT.getFundDeployerForVaultProxy(_vaultProxy) == FUND_DEPLOYER_V4, "init: Bad vault version"
        );

        depositToken = _depositToken;
        vaultProxy = _vaultProxy;

        // Optional (can be set later by owner only)
        if (_allowedDepositorListId > 0) {
            __setAllowedDepositorListId(_allowedDepositorListId);
        }

        // Optional (can be set later by owner only)
        if (_manager != address(0)) {
            __setManager(_manager);
        }

        // Optional (can be set later by owner only)
        if (_totalDepositMax > 0) {
            __setTotalDepositMax(_totalDepositMax);
        }

        // Optional (can NOT be set later)
        if (_transfersAllowed) {
            transfersAllowed = true;
        }

        // Optional (can NOT be set later)
        if (_feeRecipient != address(0)) {
            require(_feeBps < MAX_BPS, "init: Max fee exceeded");

            feeBps = _feeBps;
            feeRecipient = _feeRecipient;

            if (_feeExcludesDepositTokenPrincipal) {
                feeExcludesDepositTokenPrincipal = true;
            }
        }

        emit Initialized(
            _vaultProxy, _depositToken, _transfersAllowed, _feeRecipient, _feeBps, _feeExcludesDepositTokenPrincipal
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to get the owner, who is the same as the VaultProxy owner
    function __getOwnerOfVaultProxy(address _vaultProxy) private view returns (address owner_) {
        return IVault(_vaultProxy).getOwner();
    }

    /// @dev Helper to set the allowed depositors listId
    function __setAllowedDepositorListId(uint128 _nextAllowedDepositorListId) private {
        allowedDepositorListId = _nextAllowedDepositorListId;

        emit AllowedDepositorListIdSet(_nextAllowedDepositorListId);
    }

    /// @dev Helper to set the manager
    function __setManager(address _nextManager) private {
        manager = _nextManager;

        emit ManagerSet(_nextManager);
    }

    /// @dev Helper to set the `totalDepositMax` var
    function __setTotalDepositMax(uint128 _nextTotalDepositMax) private {
        totalDepositMax = _nextTotalDepositMax;

        emit TotalDepositMaxSet(_nextTotalDepositMax);
    }

    /////////////////////
    // ERC20 OVERRIDES //
    /////////////////////

    /// @notice Gets the name of the wrapped shares token
    /// @return name_ The name
    function name() public view override returns (string memory name_) {
        if (address(this) == THIS_LIB) {
            return super.name();
        }

        return string(abi.encodePacked("Wrapped ", ERC20(getVaultProxy()).name()));
    }

    /// @notice Gets the symbol of the wrapped shares token
    /// @return symbol_ The symbol
    function symbol() public view override returns (string memory symbol_) {
        if (address(this) == THIS_LIB) {
            return super.symbol();
        }

        return string(abi.encodePacked("w", ERC20(getVaultProxy()).symbol()));
    }

    /// @notice Gets the number of decimals of the wrapped shares token
    /// @return decimals_ The number of decimals
    function decimals() public view override returns (uint8 decimals_) {
        return 18;
    }

    /// @dev Standard implementation of ERC20's transfer().
    /// Blocks transfers if not allowed.
    function transfer(address _recipient, uint256 _amount)
        public
        override
        onlyTransfersAllowed
        returns (bool success_)
    {
        return super.transfer(_recipient, _amount);
    }

    /// @dev Standard implementation of ERC20's transferFrom().
    /// Blocks transfers if not allowed.
    function transferFrom(address _sender, address _recipient, uint256 _amount)
        public
        override
        onlyTransfersAllowed
        returns (bool success_)
    {
        return super.transferFrom(_sender, _recipient, _amount);
    }

    ////////////////////
    // INVESTOR CALLS //
    ////////////////////

    /// @notice Deposits an amount of the deposit token in exchange for wrapped shares
    /// @param _amount The amount of the deposit token to deposit
    function deposit(uint256 _amount) external {
        require(getState() == State.Deposit, "deposit: Unallowed State");

        // Allowed depositor check
        uint256 allowedDepositorListIdMem = getAllowedDepositorListId();
        if (allowedDepositorListIdMem > 0) {
            require(
                ADDRESS_LIST_REGISTRY_CONTRACT.isInList(allowedDepositorListIdMem, msg.sender),
                "deposit: Unallowed caller"
            );
        }

        ERC20 depositTokenContract = ERC20(getDepositToken());

        // Global max deposit limit check
        uint256 totalDepositMaxMem = getTotalDepositMax();
        if (totalDepositMaxMem > 0) {
            require(
                depositTokenContract.balanceOf(address(this)).add(_amount) <= totalDepositMaxMem,
                "deposit: Max exceeded"
            );
        }

        // Start tracking the protocol fee due from the first deposit.
        // Using total supply as an indicator is a bit cheaper after the first deposit,
        // since it's already going to be warm for _mint().
        if (totalSupply() == 0) {
            protocolFeeStart = uint32(block.timestamp);

            emit ProtocolFeeStarted();
        }

        // Mints wrapped shares 1:1 with depositToken
        _mint(msg.sender, _amount);

        depositTokenContract.safeTransferFrom(msg.sender, address(this), _amount);

        emit Deposited(msg.sender, _amount);
    }

    /// @notice Withdraws a pro-rata share of all assets in exchange for burning wrapped shares
    /// @param _amount The amount of shares to exchange
    /// @param _additionalAssets A list of any additional assets to claim (not stored in redeemedAssets)
    /// @return claimedAssets_ The ordered assets claimed
    /// @return claimedAssetAmounts_ The actual amounts of assets claimed
    /// @dev Any assets not claimed will be forfeited. All should be included automatically via redeemedAssets,
    /// unless a vault manager error occurs, such as forgetting to claim untracked assets during redemption,
    /// which they would then need to send to the wrapper manually.
    function withdraw(uint256 _amount, address[] calldata _additionalAssets)
        external
        nonReentrant
        returns (address[] memory claimedAssets_, uint256[] memory claimedAssetAmounts_)
    {
        // Allowed during Deposit and Redeem states
        State stateMem = getState();
        require(stateMem != State.Locked, "withdraw: Unallowed State");

        if (stateMem == State.Deposit) {
            // Only allow deposit token to be withdrawn during Deposit state
            require(_additionalAssets.length == 0, "withdraw: Only deposit token withdrawable");

            claimedAssets_ = new address[](1);
            claimedAssets_[0] = getDepositToken();
        } else {
            require(_additionalAssets.isUniqueSet(), "withdraw: Duplicate _additionalAssets");

            claimedAssets_ = getRedeemedAssets().mergeArray(_additionalAssets);
        }

        // Get supply pre-burn
        uint256 wrappedSharesSupply = totalSupply();

        // Burn prior to distributing assets
        _burn(msg.sender, _amount);

        // Distribute the assets claimed
        claimedAssetAmounts_ = new uint256[](claimedAssets_.length);
        for (uint256 i; i < claimedAssets_.length; i++) {
            ERC20 assetContract = ERC20(claimedAssets_[i]);
            claimedAssetAmounts_[i] = assetContract.balanceOf(address(this)).mul(_amount).div(wrappedSharesSupply);

            if (claimedAssetAmounts_[i] > 0) {
                assetContract.safeTransfer(msg.sender, claimedAssetAmounts_[i]);
            }
        }

        emit Withdrawn(msg.sender, _amount, claimedAssets_, claimedAssetAmounts_);

        return (claimedAssets_, claimedAssetAmounts_);
    }

    //////////////////////////////////
    // TRUSTLESS WRAPPER MANAGEMENT //
    //////////////////////////////////

    /// @notice Enters Locked state, transferring the deposit token to the vault and buying vault
    /// shares in the process
    /// @dev Requires that the current contract contains some amount of the denomination asset
    /// with which to buy vault shares. It is recommended to use an insignificant amount of value,
    /// as wrapped shareholders will have a claim to a pro-rata share.
    function enterLockedState() external {
        address vaultProxyMem = getVaultProxy();
        __validateIsManagerOrOwner(msg.sender, vaultProxyMem);

        require(getState() == State.Deposit, "enterLockedState: Invalid state");

        // Buy shares from the fund, using whatever amount of the denomination asset is in the current contract
        IComptroller comptrollerProxyContract = IComptroller(IVault(vaultProxyMem).getAccessor());
        ERC20 denominationAssetContract = ERC20(comptrollerProxyContract.getDenominationAsset());
        uint256 investmentAmount = denominationAssetContract.balanceOf(address(this));

        denominationAssetContract.safeApprove(address(comptrollerProxyContract), investmentAmount);
        uint256 receivedShares = comptrollerProxyContract.buyShares(investmentAmount, 1);

        // Validate the received shares to guarantee that the deposit token contribution
        // of this contract cannot be diluted by more than 1 bps
        uint256 thirdPartyShares = ERC20(vaultProxyMem).totalSupply().sub(receivedShares);
        require(
            thirdPartyShares == 0 || receivedShares > thirdPartyShares.mul(MAX_BPS),
            "enterLockedState: Min shares not met"
        );

        // Move to Locked state
        __setState(State.Locked);

        // Send deposit tokens to vault
        ERC20 depositTokenContract = ERC20(getDepositToken());
        depositTokenContract.safeTransfer(vaultProxyMem, depositTokenContract.balanceOf(address(this)));
    }

    /// @notice Enters Redeem state, redeeming all vault shares and paying out both protocol and wrapper fees
    /// @param _untrackedAssetsToClaim A list of any assets to claim that are untracked in the vault
    /// @dev Vault managers must move all value into the vault and should track all assets prior to
    /// calling this function. Any untracked assets can also be claimed by specifying them in _untrackedAssetsToClaim.
    function enterRedeemState(address[] calldata _untrackedAssetsToClaim) external {
        address vaultProxyMem = getVaultProxy();
        __validateIsManagerOrOwner(msg.sender, vaultProxyMem);

        require(getState() == State.Locked, "enterRedeemState: Invalid state");

        // Validate that there are no active external positions that contain value.
        // Allows a fund to keep an external position active, so long as it has been emptied.
        address[] memory externalPositions = IVault(vaultProxyMem).getActiveExternalPositions();
        for (uint256 i; i < externalPositions.length; i++) {
            (, uint256[] memory managedAssetAmounts) = IExternalPosition(externalPositions[i]).getManagedAssets();
            for (uint256 j; j < managedAssetAmounts.length; j++) {
                require(managedAssetAmounts[j] == 0, "enterRedeemState: Non-zero value external position");
            }
        }

        // Redeem all fund shares, receiving an in-kind distribution of vault holdings
        IComptroller comptrollerProxyContract = IComptroller(IVault(getVaultProxy()).getAccessor());
        // Always includes the deposit token as an "additional asset" to claim,
        // in case it is untracked in the vault
        address[] memory additionalAssetsToClaim = _untrackedAssetsToClaim.addUniqueItem(getDepositToken());

        (address[] memory payoutAssets, uint256[] memory payoutAmounts) = comptrollerProxyContract.redeemSharesInKind(
            address(this), type(uint256).max, additionalAssetsToClaim, new address[](0)
        );

        // Filter out any zero-balance assets
        address[] memory nonEmptyAssets;
        for (uint256 i; i < payoutAssets.length; i++) {
            if (payoutAmounts[i] > 0) {
                nonEmptyAssets = nonEmptyAssets.addItem(payoutAssets[i]);
            }
        }

        redeemedAssets = nonEmptyAssets;

        // Pay protocol fee prior to paying out any local fees
        __payoutProtocolFees(nonEmptyAssets);
        __payoutLocalFees(nonEmptyAssets);

        // Move to Redeem state
        __setState(State.Redeem);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to payout wrapper fees
    function __payoutLocalFees(address[] memory _assets) private {
        uint256 feeBpsMem = getFeeBps();
        if (feeBpsMem == 0) {
            return;
        }

        address feeRecipientMem = getFeeRecipient();
        address depositTokenIfPrincipalExcluded;
        if (getFeeExcludesDepositTokenPrincipal()) {
            depositTokenIfPrincipalExcluded = getDepositToken();
        }

        for (uint256 i; i < _assets.length; i++) {
            ERC20 assetContract = ERC20(_assets[i]);

            uint256 feeChargeableBalance;
            if (address(assetContract) == depositTokenIfPrincipalExcluded) {
                // totalSupply() represents the total amount of depositToken principal,
                // since wrapped shares are minted 1:1 with the depositToken.
                // The total supply in excess of the asset balance is a gain on principal.
                feeChargeableBalance = __subOrZero(assetContract.balanceOf(address(this)), totalSupply());
            } else {
                feeChargeableBalance = assetContract.balanceOf(address(this));
            }

            uint256 feeAmount = feeChargeableBalance.mul(feeBpsMem).div(MAX_BPS);

            if (feeAmount > 0) {
                assetContract.safeTransfer(feeRecipientMem, feeAmount);

                emit FeePaid(address(assetContract), feeAmount);
            }
        }
    }

    /// @dev Helper to payout protocol fees
    function __payoutProtocolFees(address[] memory _assets) private {
        uint256 protocolFeeSecs = block.timestamp.sub(getProtocolFeeStart());

        for (uint256 i; i < _assets.length; i++) {
            uint256 feeAmount = ERC20(_assets[i]).balanceOf(address(this)).mul(PROTOCOL_FEE_BPS).mul(protocolFeeSecs)
                .div(MAX_BPS).div(SECONDS_IN_YEAR);
            if (feeAmount > 0) {
                ERC20(_assets[i]).safeTransfer(PROTOCOL_FEE_RECIPIENT, feeAmount);

                emit ProtocolFeePaid(_assets[i], feeAmount);
            }
        }
    }

    /// @dev Helper to set the `state` var
    function __setState(State _nextState) private {
        state = _nextState;

        emit StateSet(_nextState);
    }

    /// @dev Helper to validate whether an entity is either a fund's owner or this contract's manager
    function __validateIsManagerOrOwner(address _who, address _vaultProxy) private view {
        require(
            _who == getManager() || _who == __getOwnerOfVaultProxy(_vaultProxy),
            "__validateIsManagerOrOwner: Unauthorized"
        );
    }

    /////////////////
    // OWNER CALLS //
    /////////////////

    /// @notice Sets the allowedDepositorListId var
    /// @param _nextAllowedDepositorListId The next allowedDepositorListId value
    function setAllowedDepositorListId(uint128 _nextAllowedDepositorListId) external onlyOwner {
        __setAllowedDepositorListId(_nextAllowedDepositorListId);
    }

    /// @notice Sets the manager var
    /// @param _nextManager The next manager value
    function setManager(address _nextManager) external onlyOwner {
        __setManager(_nextManager);
    }

    /// @notice Sets the totalDepositMax var
    /// @param _nextTotalDepositMax The next totalDepositMax value
    function setTotalDepositMax(uint128 _nextTotalDepositMax) external onlyOwner {
        __setTotalDepositMax(_nextTotalDepositMax);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the allowedDepositorListId var
    /// @return allowedDepositorListId_ The allowedDepositorListId value
    function getAllowedDepositorListId() public view returns (uint256 allowedDepositorListId_) {
        return allowedDepositorListId;
    }

    /// @notice Gets the depositToken var
    /// @return depositToken_ The depositToken value
    function getDepositToken() public view returns (address depositToken_) {
        return depositToken;
    }

    /// @notice Gets the feeBps var
    /// @return feeBps_ The feeBps value
    function getFeeBps() public view returns (uint256 feeBps_) {
        return feeBps;
    }

    /// @notice Gets the feeExcludesDepositTokenPrincipal var
    /// @return excludesPrincipal_ The feeExcludesDepositTokenPrincipal value
    function getFeeExcludesDepositTokenPrincipal() public view returns (bool excludesPrincipal_) {
        return feeExcludesDepositTokenPrincipal;
    }

    /// @notice Gets the feeRecipient var
    /// @return feeRecipient_ The feeRecipient value
    function getFeeRecipient() public view returns (address feeRecipient_) {
        return feeRecipient;
    }

    /// @notice Gets the manager var
    /// @return manager_ The manager value
    function getManager() public view returns (address manager_) {
        return manager;
    }

    /// @notice Gets the protocolFeeStart var
    /// @return protocolFeeStart_ The protocolFeeStart value
    function getProtocolFeeStart() public view returns (uint256 protocolFeeStart_) {
        return protocolFeeStart;
    }

    /// @notice Gets the redeemedAssets var
    /// @return redeemedAssets_ The redeemedAssets value
    function getRedeemedAssets() public view returns (address[] memory redeemedAssets_) {
        return redeemedAssets;
    }

    /// @notice Gets the state var
    /// @return state_ The state value
    function getState() public view returns (State state_) {
        return state;
    }

    /// @notice Gets the totalDepositMax var
    /// @return totalDepositMax_ The totalDepositMax value
    function getTotalDepositMax() public view returns (uint256 totalDepositMax_) {
        return totalDepositMax;
    }

    /// @notice Gets the transfersAllowed var
    /// @return transfersAllowed_ The transfersAllowed value
    function getTransfersAllowed() public view returns (bool transfersAllowed_) {
        return transfersAllowed;
    }

    /// @notice Gets the vaultProxy var
    /// @return vaultProxy_ The vaultProxy value
    function getVaultProxy() public view returns (address vaultProxy_) {
        return vaultProxy;
    }
}
