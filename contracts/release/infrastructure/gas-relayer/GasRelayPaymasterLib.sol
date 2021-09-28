// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../../interfaces/IGsnRelayHub.sol";
import "../../interfaces/IGsnTypes.sol";
import "../../interfaces/IWETH.sol";
import "../../core/fund/comptroller/ComptrollerLib.sol";
import "../../core/fund/vault/IVault.sol";
import "../../core/fund-deployer/FundDeployer.sol";
import "../../extensions/policy-manager/PolicyManager.sol";
import "./bases/GasRelayPaymasterLibBase1.sol";
import "./IGasRelayPaymaster.sol";
import "./IGasRelayPaymasterDepositor.sol";

/// @title GasRelayPaymasterLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The core logic library for the "paymaster" contract which refunds GSN relayers
contract GasRelayPaymasterLib is IGasRelayPaymaster, GasRelayPaymasterLibBase1 {
    using SafeMath for uint256;

    // Immutable and constants
    // Sane defaults, subject to change after gas profiling
    uint256 private constant CALLDATA_SIZE_LIMIT = 10500;
    // Deposit in wei
    uint256 private constant DEPOSIT = 0.2 ether;
    // Sane defaults, subject to change after gas profiling
    uint256 private constant PRE_RELAYED_CALL_GAS_LIMIT = 100000;
    uint256 private constant POST_RELAYED_CALL_GAS_LIMIT = 110000;
    // FORWARDER_HUB_OVERHEAD = 50000;
    // PAYMASTER_ACCEPTANCE_BUDGET = FORWARDER_HUB_OVERHEAD + PRE_RELAYED_CALL_GAS_LIMIT
    uint256 private constant PAYMASTER_ACCEPTANCE_BUDGET = 150000;

    address private immutable RELAY_HUB;
    address private immutable TRUSTED_FORWARDER;
    address private immutable WETH_TOKEN;

    modifier onlyComptroller() {
        require(
            msg.sender == getParentComptroller(),
            "Can only be called by the parent comptroller"
        );
        _;
    }

    modifier relayHubOnly() {
        require(msg.sender == getHubAddr(), "Can only be called by RelayHub");
        _;
    }

    constructor(
        address _wethToken,
        address _relayHub,
        address _trustedForwarder
    ) public {
        RELAY_HUB = _relayHub;
        TRUSTED_FORWARDER = _trustedForwarder;
        WETH_TOKEN = _wethToken;
    }

    // INIT

    /// @notice Initializes a paymaster proxy
    /// @param _vault The VaultProxy associated with the paymaster proxy
    /// @dev Used to set the owning vault
    function init(address _vault) external {
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
    /// @return rejectOnRecipientRevert_ ALways false
    function preRelayedCall(
        IGsnTypes.RelayRequest calldata _relayRequest,
        bytes calldata,
        bytes calldata,
        uint256
    )
        external
        override
        relayHubOnly
        returns (bytes memory context_, bool rejectOnRecipientRevert_)
    {
        address vaultProxy = getParentVault();
        require(
            IVault(vaultProxy).canRelayCalls(_relayRequest.request.from),
            "preRelayedCall: Unauthorized caller"
        );

        bytes4 selector = __parseTxDataFunctionSelector(_relayRequest.request.data);
        require(
            __isAllowedCall(
                vaultProxy,
                _relayRequest.request.to,
                selector,
                _relayRequest.request.data
            ),
            "preRelayedCall: Function call not permitted"
        );

        return (abi.encode(_relayRequest.request.from, selector), false);
    }

    /// @notice Called by the relay hub after the relayed tx is executed, tops up deposit if flag passed through paymasterdata is true
    /// @param _context The context constructed by preRelayedCall (used to pass data from pre to post relayed call)
    /// @param _success Whether or not the relayed tx succeed
    /// @param _relayData The relay params of the request. can be used by relayHub.calculateCharge()
    function postRelayedCall(
        bytes calldata _context,
        bool _success,
        uint256,
        IGsnTypes.RelayData calldata _relayData
    ) external override relayHubOnly {
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
        require(
            msg.sender == IVault(vaultProxy).getOwner() ||
                msg.sender == __getComptrollerForVault(vaultProxy),
            "shutdownRelayer: Only owner or comptroller is authorized"
        );

        IGsnRelayHub(getHubAddr()).withdraw(getRelayHubDeposit(), payable(address(this)));

        uint256 amount = address(this).balance;

        Address.sendValue(payable(vaultProxy), amount);

        emit Withdrawn(amount);
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the current ComptrollerProxy of the VaultProxy associated with this contract
    /// @return parentComptroller_ The ComptrollerProxy
    function getParentComptroller() public view returns (address parentComptroller_) {
        return __getComptrollerForVault(parentVault);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to pull WETH from the associated vault to top up to the max ETH deposit in the relay hub
    function __depositMax() private {
        uint256 prevDeposit = getRelayHubDeposit();

        if (prevDeposit < DEPOSIT) {
            uint256 amount = DEPOSIT.sub(prevDeposit);

            IGasRelayPaymasterDepositor(getParentComptroller()).pullWethForGasRelayer(amount);

            IWETH(getWethToken()).withdraw(amount);

            IGsnRelayHub(getHubAddr()).depositFor{value: amount}(address(this));

            emit Deposited(amount);
        }
    }

    /// @dev Helper to get the ComptrollerProxy for a given VaultProxy
    function __getComptrollerForVault(address _vaultProxy)
        private
        view
        returns (address comptrollerProxy_)
    {
        return IVault(_vaultProxy).getAccessor();
    }

    /// @dev Helper to check if a contract call is allowed to be relayed using this paymaster
    /// Allowed contracts are:
    /// - VaultProxy
    /// - ComptrollerProxy
    /// - PolicyManager
    /// - FundDeployer
    function __isAllowedCall(
        address _vaultProxy,
        address _contract,
        bytes4 _selector,
        bytes calldata _txData
    ) private view returns (bool allowed_) {
        if (_contract == _vaultProxy) {
            // All calls to the VaultProxy are allowed
            return true;
        }

        address parentComptroller = __getComptrollerForVault(_vaultProxy);
        if (_contract == parentComptroller) {
            if (
                _selector == ComptrollerLib.callOnExtension.selector ||
                _selector == ComptrollerLib.vaultCallOnContract.selector ||
                _selector == ComptrollerLib.buyBackProtocolFeeShares.selector ||
                _selector == ComptrollerLib.depositToGasRelayPaymaster.selector ||
                _selector == ComptrollerLib.setAutoProtocolFeeSharesBuyback.selector
            ) {
                return true;
            }
        } else if (_contract == ComptrollerLib(parentComptroller).getPolicyManager()) {
            if (
                _selector == PolicyManager.updatePolicySettingsForFund.selector ||
                _selector == PolicyManager.enablePolicyForFund.selector ||
                _selector == PolicyManager.disablePolicyForFund.selector
            ) {
                return __parseTxDataFirstParameterAsAddress(_txData) == getParentComptroller();
            }
        } else if (_contract == ComptrollerLib(parentComptroller).getFundDeployer()) {
            if (
                _selector == FundDeployer.createReconfigurationRequest.selector ||
                _selector == FundDeployer.executeReconfiguration.selector ||
                _selector == FundDeployer.cancelReconfiguration.selector
            ) {
                return __parseTxDataFirstParameterAsAddress(_txData) == getParentVault();
            }
        }

        return false;
    }

    /// @notice Parses the first parameter of tx data as an address
    /// @param _txData The tx data to retrieve the address from
    /// @return retrievedAddress_ The extracted address
    function __parseTxDataFirstParameterAsAddress(bytes calldata _txData)
        private
        pure
        returns (address retrievedAddress_)
    {
        require(
            _txData.length >= 36,
            "__parseTxDataFirstParameterAsAddress: _txData is not a valid length"
        );

        return abi.decode(_txData[4:36], (address));
    }

    /// @notice Parses the function selector from tx data
    /// @param _txData The tx data
    /// @return functionSelector_ The extracted function selector
    function __parseTxDataFunctionSelector(bytes calldata _txData)
        private
        pure
        returns (bytes4 functionSelector_)
    {
        /// convert bytes[:4] to bytes4
        require(
            _txData.length >= 4,
            "__parseTxDataFunctionSelector: _txData is not a valid length"
        );

        functionSelector_ =
            _txData[0] |
            (bytes4(_txData[1]) >> 8) |
            (bytes4(_txData[2]) >> 16) |
            (bytes4(_txData[3]) >> 24);

        return functionSelector_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets gas limits used by the relay hub for the pre and post relay calls
    /// @return limits_ `GasAndDataLimits(PAYMASTER_ACCEPTANCE_BUDGET, PRE_RELAYED_CALL_GAS_LIMIT, POST_RELAYED_CALL_GAS_LIMIT, CALLDATA_SIZE_LIMIT)`
    function getGasAndDataLimits()
        external
        view
        override
        returns (IGsnPaymaster.GasAndDataLimits memory limits_)
    {
        return
            IGsnPaymaster.GasAndDataLimits(
                PAYMASTER_ACCEPTANCE_BUDGET,
                PRE_RELAYED_CALL_GAS_LIMIT,
                POST_RELAYED_CALL_GAS_LIMIT,
                CALLDATA_SIZE_LIMIT
            );
    }

    /// @notice Gets the `RELAY_HUB` variable value
    /// @return relayHub_ The `RELAY_HUB` value
    function getHubAddr() public view override returns (address relayHub_) {
        return RELAY_HUB;
    }

    /// @notice Gets the `parentVault` variable value
    /// @return parentVault_ The `parentVault` value
    function getParentVault() public view returns (address parentVault_) {
        return parentVault;
    }

    /// @notice Look up amount of ETH deposited on the relay hub
    /// @return depositBalance_ amount of ETH deposited on the relay hub
    function getRelayHubDeposit() public view override returns (uint256 depositBalance_) {
        return IGsnRelayHub(getHubAddr()).balanceOf(address(this));
    }

    /// @notice Gets the `WETH_TOKEN` variable value
    /// @return wethToken_ The `WETH_TOKEN` value
    function getWethToken() public view returns (address wethToken_) {
        return WETH_TOKEN;
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
