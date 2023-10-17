// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {SafeMath} from "openzeppelin-solc-0.6/math/SafeMath.sol";
import {ERC20} from "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import {FundDeployerOwnerMixin} from "../../utils/0.6.12/FundDeployerOwnerMixin.sol";
import {IProtocolFeeTracker} from "./IProtocolFeeTracker.sol";

/// @title ProtocolFeeTracker Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The contract responsible for tracking owed protocol fees
contract ProtocolFeeTracker is IProtocolFeeTracker, FundDeployerOwnerMixin {
    using SafeMath for uint256;

    event InitializedForVault(address vaultProxy);

    event FeeBpsDefaultSet(uint256 nextFeeBpsDefault);

    event FeeBpsOverrideSetForVault(address indexed vaultProxy, uint256 nextFeeBpsOverride);

    event FeePaidForVault(address indexed vaultProxy, uint256 sharesAmount, uint256 secondsPaid);

    event LastPaidSetForVault(address indexed vaultProxy, uint256 prevTimestamp, uint256 nextTimestamp);

    uint256 private constant MAX_BPS = 10000;
    uint256 private constant SECONDS_IN_YEAR = 31557600; // 60*60*24*365.25

    uint256 private feeBpsDefault;
    mapping(address => uint256) private vaultProxyToFeeBpsOverride;
    mapping(address => uint256) private vaultProxyToLastPaid;

    constructor(address _fundDeployer) public FundDeployerOwnerMixin(_fundDeployer) {
        // Validate constants
        require(SECONDS_IN_YEAR == (60 * 60 * 24 * 36525) / 100, "constructor: Incorrect SECONDS_IN_YEAR");
    }

    // EXTERNAL FUNCTIONS

    /// @notice Initializes protocol fee tracking for a given VaultProxy
    /// @param _vaultProxy The VaultProxy
    /// @dev Does not validate whether _vaultProxy is already initialized,
    /// as FundDeployer will only do this once
    function initializeForVault(address _vaultProxy) external override {
        require(msg.sender == getFundDeployer(), "Only the FundDeployer can call this function");

        __setLastPaidForVault(_vaultProxy, block.timestamp);

        emit InitializedForVault(_vaultProxy);
    }

    /// @notice Marks the protocol fee as paid for the sender, and gets the amount of shares that
    /// should be minted for payment
    /// @return sharesDue_ The amount of shares to be minted for payment
    /// @dev This trusts the VaultProxy to mint the correct sharesDue_.
    /// There is no need to validate that the VaultProxy is still on this release.
    function payFee() external override returns (uint256 sharesDue_) {
        address vaultProxy = msg.sender;

        // VaultProxy is validated during initialization
        uint256 lastPaid = getLastPaidForVault(vaultProxy);
        if (lastPaid >= block.timestamp) {
            return 0;
        }

        // Not strictly necessary as we trust the FundDeployer to have already initialized the
        // VaultProxy, but inexpensive
        require(lastPaid > 0, "payFee: VaultProxy not initialized");

        uint256 secondsDue = block.timestamp.sub(lastPaid);
        sharesDue_ = __calcSharesDueForVault(vaultProxy, secondsDue);

        // Even if sharesDue_ is 0, we update the lastPaid timestamp and emit the event
        __setLastPaidForVault(vaultProxy, block.timestamp);

        emit FeePaidForVault(vaultProxy, sharesDue_, secondsDue);

        return sharesDue_;
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the protocol fee rate (in bps) for a given VaultProxy
    /// @param _vaultProxy The VaultProxy
    /// @return feeBps_ The protocol fee (in bps)
    function getFeeBpsForVault(address _vaultProxy) public view override returns (uint256 feeBps_) {
        feeBps_ = getFeeBpsOverrideForVault(_vaultProxy);

        if (feeBps_ == 0) {
            feeBps_ = getFeeBpsDefault();
        }

        return feeBps_;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the protocol fee shares due for a given VaultProxy
    function __calcSharesDueForVault(address _vaultProxy, uint256 _secondsDue)
        private
        view
        returns (uint256 sharesDue_)
    {
        uint256 sharesSupply = ERC20(_vaultProxy).totalSupply();

        uint256 rawSharesDue =
            sharesSupply.mul(getFeeBpsForVault(_vaultProxy)).mul(_secondsDue).div(SECONDS_IN_YEAR).div(MAX_BPS);

        uint256 supplyNetRawSharesDue = sharesSupply.sub(rawSharesDue);
        if (supplyNetRawSharesDue == 0) {
            return 0;
        }

        return rawSharesDue.mul(sharesSupply).div(supplyNetRawSharesDue);
    }

    /// @dev Helper to set the lastPaid timestamp for a given VaultProxy
    function __setLastPaidForVault(address _vaultProxy, uint256 _nextTimestamp) private {
        vaultProxyToLastPaid[_vaultProxy] = _nextTimestamp;
    }

    ////////////////
    // ADMIN ONLY //
    ////////////////

    /// @notice Sets the default protocol fee rate (in bps)
    /// @param _nextFeeBpsDefault The default protocol fee rate (in bps) to set
    function setFeeBpsDefault(uint256 _nextFeeBpsDefault) external override onlyFundDeployerOwner {
        require(_nextFeeBpsDefault < MAX_BPS, "setDefaultFeeBps: Exceeds max");

        feeBpsDefault = _nextFeeBpsDefault;

        emit FeeBpsDefaultSet(_nextFeeBpsDefault);
    }

    /// @notice Sets a specified protocol fee rate (in bps) for a particular VaultProxy
    /// @param _vaultProxy The VaultProxy
    /// @param _nextFeeBpsOverride The protocol fee rate (in bps) to set
    function setFeeBpsOverrideForVault(address _vaultProxy, uint256 _nextFeeBpsOverride)
        external
        override
        onlyFundDeployerOwner
    {
        require(_nextFeeBpsOverride < MAX_BPS, "setFeeBpsOverrideForVault: Exceeds max");

        vaultProxyToFeeBpsOverride[_vaultProxy] = _nextFeeBpsOverride;

        emit FeeBpsOverrideSetForVault(_vaultProxy, _nextFeeBpsOverride);
    }

    /// @notice Sets the lastPaid timestamp for a specified VaultProxy
    /// @param _vaultProxy The VaultProxy
    /// @param _nextTimestamp The lastPaid timestamp to set
    function setLastPaidForVault(address _vaultProxy, uint256 _nextTimestamp) external override onlyFundDeployerOwner {
        uint256 prevTimestamp = getLastPaidForVault(_vaultProxy);
        require(prevTimestamp > 0, "setLastPaidForVault: _vaultProxy not initialized");
        require(
            _nextTimestamp > prevTimestamp || _nextTimestamp > block.timestamp,
            "setLastPaidForVault: Can only increase or set a future timestamp"
        );

        __setLastPaidForVault(_vaultProxy, _nextTimestamp);

        emit LastPaidSetForVault(_vaultProxy, prevTimestamp, _nextTimestamp);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `feeBpsDefault` variable value
    /// @return feeBpsDefault_ The `feeBpsDefault` variable value
    function getFeeBpsDefault() public view override returns (uint256 feeBpsDefault_) {
        return feeBpsDefault;
    }

    /// @notice Gets the feeBpsOverride value for the given VaultProxy
    /// @param _vaultProxy The VaultProxy
    /// @return feeBpsOverride_ The feeBpsOverride value
    function getFeeBpsOverrideForVault(address _vaultProxy) public view override returns (uint256 feeBpsOverride_) {
        return vaultProxyToFeeBpsOverride[_vaultProxy];
    }

    /// @notice Gets the lastPaid value for the given VaultProxy
    /// @param _vaultProxy The VaultProxy
    /// @return lastPaid_ The lastPaid value
    function getLastPaidForVault(address _vaultProxy) public view override returns (uint256 lastPaid_) {
        return vaultProxyToLastPaid[_vaultProxy];
    }
}
