// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../utils/FundDeployerOwnerMixin.sol";
import "./utils/PreCallOnIntegrationValidatePolicyBase.sol";

/// @title GuaranteedRedemption Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A policy that guarantees that shares will either be continuously redeemable or
/// redeemable within a predictable daily window by preventing trading in a period of time in a day
contract GuaranteedRedemption is PreCallOnIntegrationValidatePolicyBase, FundDeployerOwnerMixin {
    using SafeMath for uint256;

    event AdapterAdded(address adapter);

    event AdapterRemoved(address adapter);

    event FundSettingsSet(
        address indexed comptrollerProxy,
        uint256 startTimestamp,
        uint256 duration
    );

    event RedemptionWindowBufferSet(uint256 prevBuffer, uint256 nextBuffer);

    struct RedemptionWindow {
        uint256 startTimestamp;
        uint256 duration;
    }

    uint256 private constant ONE_DAY = 24 * 60 * 60;

    mapping(address => bool) private adapterToCanBlockRedemption;
    mapping(address => RedemptionWindow) private comptrollerProxyToRedemptionWindow;
    uint256 private redemptionWindowBuffer;

    constructor(
        address _policyManager,
        address _fundDeployer,
        uint256 _redemptionWindowBuffer,
        address[] memory _redemptionBlockingAdapters
    ) public PolicyBase(_policyManager) FundDeployerOwnerMixin(_fundDeployer) {
        redemptionWindowBuffer = _redemptionWindowBuffer;

        __addRedemptionBlockingAdapters(_redemptionBlockingAdapters);
    }

    /// @notice Add the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        (uint256 startTimestamp, uint256 duration) = abi.decode(
            _encodedSettings,
            (uint256, uint256)
        );

        if (startTimestamp == 0) {
            require(duration == 0, "addFundSettings: duration must be 0 if startTimestamp is 0");
            return;
        }

        require(
            duration > 0 && duration < ONE_DAY,
            "addFundSettings: duration must be less than one day"
        );

        comptrollerProxyToRedemptionWindow[_comptrollerProxy].startTimestamp = startTimestamp;
        comptrollerProxyToRedemptionWindow[_comptrollerProxy].duration = duration;

        emit FundSettingsSet(_comptrollerProxy, startTimestamp, duration);
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "GUARANTEED_REDEMPTION";
    }

    /// @notice Checks whether a particular condition passes the rule for a particular fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _adapter The adapter for which to check the rule
    /// @return isValid_ True if the rule passes
    function passesRule(address _comptrollerProxy, address _adapter)
        public
        view
        returns (bool isValid_)
    {
        if (!adapterCanBlockRedemption(_adapter)) {
            return true;
        }


            RedemptionWindow storage redemptionWindow
         = comptrollerProxyToRedemptionWindow[_comptrollerProxy];

        if (redemptionWindow.startTimestamp == 0 && redemptionWindow.duration == 0) {
            return false;
        }

        uint256 nextRedemptionWindowStartTimestamp = calcNextRedemptionWindowStartTimestamp(
            redemptionWindow.startTimestamp
        );

        // fund can't trade from lowerBound to upperBound timestamp
        uint256 lowerBound;
        uint256 upperBound = nextRedemptionWindowStartTimestamp.add(redemptionWindow.duration);

        if (nextRedemptionWindowStartTimestamp >= redemptionWindowBuffer) {
            lowerBound = nextRedemptionWindowStartTimestamp.sub(redemptionWindowBuffer);
        }

        if (block.timestamp >= lowerBound && block.timestamp <= upperBound) {
            return false;
        }

        return true;
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    function validateRule(
        address _comptrollerProxy,
        address,
        IPolicyManager.PolicyHook,
        bytes calldata _encodedArgs
    ) external override returns (bool isValid_) {
        (address adapter, ) = __decodeRuleArgs(_encodedArgs);

        return passesRule(_comptrollerProxy, adapter);
    }

    /// @notice Add adapters which can block the redemption
    /// @param _adapters The addresses of adapters to be added
    function addRedemptionBlockingAdapters(address[] calldata _adapters)
        external
        onlyFundDeployerOwner
    {
        require(
            _adapters.length > 0,
            "__addRedemptionBlockingAdapters: _adapters can not be empty"
        );

        __addRedemptionBlockingAdapters(_adapters);
    }

    /// @notice Remove adapters which can block the redemption
    /// @param _adapters The addresses of adapters to be removed
    function removeRedemptionBlockingAdapters(address[] calldata _adapters)
        external
        onlyFundDeployerOwner
    {
        require(
            _adapters.length > 0,
            "removeRedemptionBlockingAdapters: _adapters can not be empty"
        );

        for (uint256 i; i < _adapters.length; i++) {
            require(
                adapterCanBlockRedemption(_adapters[i]),
                "removeRedemptionBlockingAdapters: adapter is not added"
            );

            adapterToCanBlockRedemption[_adapters[i]] = false;

            emit AdapterRemoved(_adapters[i]);
        }
    }

    /// @notice Sets a new value for the redemptionWindowBuffer
    /// @param _redemptionWindowBuffer The duration before redemptionWindow to block any
    /// potential trading that can disrupt the redemption process during redemptionWindow
    /// (ie: synthetix blocks token transfers during a timelock after trading request submitted)
    function setRedemptionWindowBuffer(uint256 _redemptionWindowBuffer)
        external
        onlyFundDeployerOwner
    {
        require(
            redemptionWindowBuffer != _redemptionWindowBuffer,
            "setRedemptionWindowBuffer: _redemptionWindowBuffer value is already set"
        );

        emit RedemptionWindowBufferSet(redemptionWindowBuffer, _redemptionWindowBuffer);

        redemptionWindowBuffer = _redemptionWindowBuffer;
    }

    /// @notice Calculate the most recent startTimestamp
    /// @param _startTimestamp The startTimestamp configured
    /// @return nextRedemptionWindowStartTimestamp_ The startTimestamp of the most recent day
    function calcNextRedemptionWindowStartTimestamp(uint256 _startTimestamp)
        public
        view
        returns (uint256 nextRedemptionWindowStartTimestamp_)
    {
        if (block.timestamp <= _startTimestamp) {
            return _startTimestamp;
        } else {
            uint256 timeSinceStartTimestamp = block.timestamp.sub(_startTimestamp);
            uint256 timeSincePeriodStart = timeSinceStartTimestamp.mod(ONE_DAY);

            return block.timestamp.sub(timeSincePeriodStart);
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to mark adapters can block redemptions
    function __addRedemptionBlockingAdapters(address[] memory _adapters) private {
        for (uint256 i; i < _adapters.length; i++) {
            require(
                !adapterCanBlockRedemption(_adapters[i]),
                "__addRedemptionBlockingAdapters: adapter already added"
            );
            require(
                _adapters[i] != address(0),
                "__addRedemptionBlockingAdapters: adapter can not be address 0"
            );

            adapterToCanBlockRedemption[_adapters[i]] = true;

            emit AdapterAdded(_adapters[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the redemptionWindow for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return redemptionWindow_ The redemption window within which a fund is allowed to redeem
    function getRedemptionWindowForFund(address _comptrollerProxy)
        external
        view
        returns (RedemptionWindow memory redemptionWindow_)
    {
        return comptrollerProxyToRedemptionWindow[_comptrollerProxy];
    }

    /// @notice Gets the redemptionWindowBuffer
    /// @return redemptionWindowBuffer_ The duration before the redemptionWindow
    function getRedemptionWindowBuffer() external view returns (uint256 redemptionWindowBuffer_) {
        return redemptionWindowBuffer;
    }

    /// @notice Check whether an adapter can block a redemption
    /// @param _adapter The address of the adapter to check
    /// @return isAddedAdapter_ True if the adapter can block a redemption
    function adapterCanBlockRedemption(address _adapter)
        public
        view
        returns (bool isAddedAdapter_)
    {
        return adapterToCanBlockRedemption[_adapter];
    }
}
