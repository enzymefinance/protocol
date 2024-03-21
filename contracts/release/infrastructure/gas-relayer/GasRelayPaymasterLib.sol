// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {SafeMath} from "openzeppelin-solc-0.6/math/SafeMath.sol";
import {Address} from "openzeppelin-solc-0.6/utils/Address.sol";
import {IGsnPaymaster} from "../../../external-interfaces/IGsnPaymaster.sol";
import {IGsnRelayHub} from "../../../external-interfaces/IGsnRelayHub.sol";
import {IGsnTypes} from "../../../external-interfaces/IGsnTypes.sol";
import {IWETH} from "../../../external-interfaces/IWETH.sol";
import {IComptroller} from "../../core/fund/comptroller/IComptroller.sol";
import {IVault} from "../../core/fund/vault/IVault.sol";
import {IFundDeployer} from "../../core/fund-deployer/IFundDeployer.sol";
import {IPolicyManager} from "../../extensions/policy-manager/IPolicyManager.sol";
import {GasRelayPaymasterLibBase2} from "./bases/GasRelayPaymasterLibBase2.sol";
import {IGasRelayPaymaster} from "./IGasRelayPaymaster.sol";
import {IGasRelayPaymasterDepositor} from "./IGasRelayPaymasterDepositor.sol";

/// @title GasRelayPaymasterLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The core logic library for the "paymaster" contract which refunds GSN relayers
/// @dev Allows any permissioned user of the fund to relay any call,
/// without validation of the target of the call itself.
/// Funds with untrusted permissioned users should monitor for abuse (i.e., relaying personal calls).
/// The extent of abuse is throttled by `DEPOSIT_COOLDOWN` and `DEPOSIT_MAX_TOTAL`.
contract GasRelayPaymasterLib is IGasRelayPaymaster, GasRelayPaymasterLibBase2 {
    using SafeMath for uint256;

    event AdditionalRelayUserAdded(address indexed account);

    event AdditionalRelayUserRemoved(address indexed account);

    // Immutable and constants
    // Sane defaults, subject to change after gas profiling
    uint256 private constant CALLDATA_SIZE_LIMIT = 10500;
    // Sane defaults, subject to change after gas profiling
    uint256 private constant PRE_RELAYED_CALL_GAS_LIMIT = 100000;
    uint256 private constant POST_RELAYED_CALL_GAS_LIMIT = 110000;
    // FORWARDER_HUB_OVERHEAD = 50000;
    // PAYMASTER_ACCEPTANCE_BUDGET = FORWARDER_HUB_OVERHEAD + PRE_RELAYED_CALL_GAS_LIMIT
    uint256 private constant PAYMASTER_ACCEPTANCE_BUDGET = 150000;

    uint256 private immutable DEPOSIT_COOLDOWN; // in seconds
    uint256 private immutable DEPOSIT_MAX_TOTAL; // in wei
    uint256 private immutable RELAY_FEE_MAX_BASE;
    uint256 private immutable RELAY_FEE_MAX_PERCENT; // e.g., `10` is 10%
    address private immutable RELAY_HUB;
    address private immutable TRUSTED_FORWARDER;
    address private immutable WETH_TOKEN;

    mapping(address => bool) private accountToIsAdditionalRelayUser;

    modifier onlyComptroller() {
        require(msg.sender == getParentComptroller(), "Can only be called by the parent comptroller");
        _;
    }

    modifier onlyFundOwner() {
        require(__msgSender() == IVault(getParentVault()).getOwner(), "Only the fund owner can call this function");
        _;
    }

    modifier relayHubOnly() {
        require(msg.sender == getHubAddr(), "Can only be called by RelayHub");
        _;
    }

    constructor(
        address _wethToken,
        address _relayHub,
        address _trustedForwarder,
        uint256 _depositCooldown,
        uint256 _depositMaxTotal,
        uint256 _relayFeeMaxBase,
        uint256 _relayFeeMaxPercent
    ) public {
        DEPOSIT_COOLDOWN = _depositCooldown;
        DEPOSIT_MAX_TOTAL = _depositMaxTotal;
        RELAY_FEE_MAX_BASE = _relayFeeMaxBase;
        RELAY_FEE_MAX_PERCENT = _relayFeeMaxPercent;
        RELAY_HUB = _relayHub;
        TRUSTED_FORWARDER = _trustedForwarder;
        WETH_TOKEN = _wethToken;
    }

    // INIT

    /// @notice Initializes a paymaster proxy
    /// @param _vault The VaultProxy associated with the paymaster proxy
    /// @dev Used to set the owning vault
    function init(address _vault) external override {
        require(getParentVault() == address(0), "init: Paymaster already initialized");

        parentVault = _vault;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Pull deposit from the vault and reactivate relaying
    function deposit() external override onlyComptroller {
        __depositMax();
    }

    /// @notice Checks whether the paymaster will pay for a given relayed tx
    /// @param _relayRequest The full relay request structure
    /// @return context_ The tx signer and the fn sig, encoded so that it can be passed to `postRelayCall`
    /// @return rejectOnRecipientRevert_ Always false
    function preRelayedCall(IGsnTypes.RelayRequest calldata _relayRequest, bytes calldata, bytes calldata, uint256)
        external
        override
        relayHubOnly
        returns (bytes memory context_, bool rejectOnRecipientRevert_)
    {
        require(_relayRequest.relayData.forwarder == TRUSTED_FORWARDER, "preRelayedCall: Unauthorized forwarder");
        require(_relayRequest.relayData.baseRelayFee <= RELAY_FEE_MAX_BASE, "preRelayedCall: High baseRelayFee");
        require(_relayRequest.relayData.pctRelayFee <= RELAY_FEE_MAX_PERCENT, "preRelayedCall: High pctRelayFee");

        // No Enzyme txs require msg.value
        require(_relayRequest.request.value == 0, "preRelayedCall: Non-zero value");

        // Allow any transaction, as long as it's from a permissioned account for the fund
        address vaultProxy = getParentVault();
        require(
            IVault(vaultProxy).canRelayCalls(_relayRequest.request.from)
                || isAdditionalRelayUser(_relayRequest.request.from),
            "preRelayedCall: Unauthorized caller"
        );

        bytes4 selector = __parseTxDataFunctionSelector(_relayRequest.request.data);

        return (abi.encode(_relayRequest.request.from, selector), false);
    }

    /// @notice Called by the relay hub after the relayed tx is executed, tops up deposit if flag passed through paymasterdata is true
    /// @param _context The context constructed by preRelayedCall (used to pass data from pre to post relayed call)
    /// @param _success Whether or not the relayed tx succeed
    /// @param _relayData The relay params of the request. can be used by relayHub.calculateCharge()
    function postRelayedCall(bytes calldata _context, bool _success, uint256, IGsnTypes.RelayData calldata _relayData)
        external
        override
        relayHubOnly
    {
        bool shouldTopUpDeposit = abi.decode(_relayData.paymasterData, (bool));
        if (shouldTopUpDeposit) {
            __depositMax();
        }

        (address spender, bytes4 selector) = abi.decode(_context, (address, bytes4));
        emit TransactionRelayed(spender, selector, _success);
    }

    /// @notice Send any deposited ETH back to the vault
    function withdrawBalance() external override {
        address vaultProxy = getParentVault();
        address canonicalSender = __msgSender();
        require(
            canonicalSender == IVault(vaultProxy).getOwner() || canonicalSender == __getComptrollerForVault(vaultProxy),
            "withdrawBalance: Only owner or comptroller is authorized"
        );

        IGsnRelayHub(getHubAddr()).withdraw(getRelayHubDeposit(), payable(address(this)));

        uint256 amount = address(this).balance;

        Address.sendValue(payable(vaultProxy), amount);

        emit Withdrawn(amount);
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the current ComptrollerProxy of the VaultProxy associated with this contract
    /// @return parentComptroller_ The ComptrollerProxy
    function getParentComptroller() public view override returns (address parentComptroller_) {
        return __getComptrollerForVault(parentVault);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to pull WETH from the associated vault to top up to the max ETH deposit in the relay hub
    function __depositMax() private {
        // Only allow one deposit every DEPOSIT_COOLDOWN seconds
        if (block.timestamp - getLastDepositTimestamp() < DEPOSIT_COOLDOWN) {
            return;
        }

        // Cap the total deposit to DEPOSIT_MAX_TOTAL wei
        uint256 prevDeposit = getRelayHubDeposit();
        if (prevDeposit >= DEPOSIT_MAX_TOTAL) {
            return;
        }
        uint256 amount = DEPOSIT_MAX_TOTAL.sub(prevDeposit);

        IGasRelayPaymasterDepositor(getParentComptroller()).pullWethForGasRelayer(amount);

        IWETH(getWethToken()).withdraw(amount);

        IGsnRelayHub(getHubAddr()).depositFor{value: amount}(address(this));

        lastDepositTimestamp = block.timestamp;

        emit Deposited(amount);
    }

    /// @dev Helper to get the ComptrollerProxy for a given VaultProxy
    function __getComptrollerForVault(address _vaultProxy) private view returns (address comptrollerProxy_) {
        return IVault(_vaultProxy).getAccessor();
    }

    /// @dev Helper to parse the canonical msg sender from trusted forwarder relayed calls
    /// See https://github.com/opengsn/gsn/blob/da4222b76e3ae1968608dc5c5d80074dcac7c4be/packages/contracts/src/ERC2771Recipient.sol#L41-L53
    function __msgSender() internal view returns (address canonicalSender_) {
        if (msg.data.length >= 20 && msg.sender == TRUSTED_FORWARDER) {
            assembly {
                canonicalSender_ := shr(96, calldataload(sub(calldatasize(), 20)))
            }

            return canonicalSender_;
        }

        return msg.sender;
    }

    /// @notice Parses the function selector from tx data
    /// @param _txData The tx data
    /// @return functionSelector_ The extracted function selector
    function __parseTxDataFunctionSelector(bytes calldata _txData) private pure returns (bytes4 functionSelector_) {
        /// convert bytes[:4] to bytes4
        require(_txData.length >= 4, "__parseTxDataFunctionSelector: _txData is not a valid length");

        functionSelector_ =
            _txData[0] | (bytes4(_txData[1]) >> 8) | (bytes4(_txData[2]) >> 16) | (bytes4(_txData[3]) >> 24);

        return functionSelector_;
    }

    //////////////////////////////////////
    // REGISTRY: ADDITIONAL RELAY USERS //
    //////////////////////////////////////

    /// @notice Adds additional relay users
    /// @param _usersToAdd The users to add
    function addAdditionalRelayUsers(address[] calldata _usersToAdd) external override onlyFundOwner {
        for (uint256 i; i < _usersToAdd.length; i++) {
            address user = _usersToAdd[i];
            require(!isAdditionalRelayUser(user), "addAdditionalRelayUsers: User registered");

            accountToIsAdditionalRelayUser[user] = true;

            emit AdditionalRelayUserAdded(user);
        }
    }

    /// @notice Removes additional relay users
    /// @param _usersToRemove The users to remove
    function removeAdditionalRelayUsers(address[] calldata _usersToRemove) external override onlyFundOwner {
        for (uint256 i; i < _usersToRemove.length; i++) {
            address user = _usersToRemove[i];
            require(isAdditionalRelayUser(user), "removeAdditionalRelayUsers: User not registered");

            accountToIsAdditionalRelayUser[user] = false;

            emit AdditionalRelayUserRemoved(user);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets gas limits used by the relay hub for the pre and post relay calls
    /// @return limits_ `GasAndDataLimits(PAYMASTER_ACCEPTANCE_BUDGET, PRE_RELAYED_CALL_GAS_LIMIT, POST_RELAYED_CALL_GAS_LIMIT, CALLDATA_SIZE_LIMIT)`
    function getGasAndDataLimits() external view override returns (IGsnPaymaster.GasAndDataLimits memory limits_) {
        return IGsnPaymaster.GasAndDataLimits(
            PAYMASTER_ACCEPTANCE_BUDGET, PRE_RELAYED_CALL_GAS_LIMIT, POST_RELAYED_CALL_GAS_LIMIT, CALLDATA_SIZE_LIMIT
        );
    }

    /// @notice Gets the `RELAY_HUB` variable value
    /// @return relayHub_ The `RELAY_HUB` value
    function getHubAddr() public view override returns (address relayHub_) {
        return RELAY_HUB;
    }

    /// @notice Gets the timestamp at last deposit into the relayer
    /// @return lastDepositTimestamp_ The timestamp
    function getLastDepositTimestamp() public view override returns (uint256 lastDepositTimestamp_) {
        return lastDepositTimestamp;
    }

    /// @notice Gets the `parentVault` variable value
    /// @return parentVault_ The `parentVault` value
    function getParentVault() public view override returns (address parentVault_) {
        return parentVault;
    }

    /// @notice Look up amount of ETH deposited on the relay hub
    /// @return depositBalance_ amount of ETH deposited on the relay hub
    function getRelayHubDeposit() public view override returns (uint256 depositBalance_) {
        return IGsnRelayHub(getHubAddr()).balanceOf(address(this));
    }

    /// @notice Gets the `WETH_TOKEN` variable value
    /// @return wethToken_ The `WETH_TOKEN` value
    function getWethToken() public view override returns (address wethToken_) {
        return WETH_TOKEN;
    }

    /// @notice Checks whether an account is an approved additional relayer user
    /// @return isAdditionalRelayUser_ True if the account is an additional relayer user
    function isAdditionalRelayUser(address _who) public view override returns (bool isAdditionalRelayUser_) {
        return accountToIsAdditionalRelayUser[_who];
    }

    /// @notice Gets the `TRUSTED_FORWARDER` variable value
    /// @return trustedForwarder_ The forwarder contract which is trusted to validated the relayed tx signature
    function trustedForwarder() external view override returns (address trustedForwarder_) {
        return TRUSTED_FORWARDER;
    }

    /// @notice Gets the string representation of the contract version (fulfills interface)
    /// @return versionString_ The version string
    function versionPaymaster() external view override returns (string memory versionString_) {
        return "2.2.3+opengsn.enzymefund.ipaymaster";
    }
}
