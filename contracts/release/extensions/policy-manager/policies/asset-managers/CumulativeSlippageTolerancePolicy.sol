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
import "../../../../../persistent/address-list-registry/AddressListRegistry.sol";
import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../infrastructure/value-interpreter/ValueInterpreter.sol";
import "../utils/PolicyBase.sol";
import "../utils/PricelessAssetBypassMixin.sol";

/// @title CumulativeSlippageTolerancePolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that limits cumulative slippage (i.e., value loss) via adapter actions
contract CumulativeSlippageTolerancePolicy is PolicyBase, PricelessAssetBypassMixin {
    using SafeMath for uint256;

    event CumulativeSlippageUpdatedForFund(
        address indexed comptrollerProxy,
        uint256 nextCumulativeSlippage
    );

    event FundSettingsSet(address indexed comptrollerProxy, uint256 tolerance);

    struct PolicyInfo {
        uint16 tolerance;
        uint16 cumulativeSlippage;
        uint128 lastSlippageTimestamp;
    }

    uint256 private constant ONE_HUNDRED_PERCENT = 10000;

    address private immutable ADDRESS_LIST_REGISTRY;
    uint256 private immutable BYPASSABLE_ADAPTERS_LIST_ID;
    uint256 private immutable TOLERANCE_PERIOD_DURATION;

    mapping(address => PolicyInfo) private comptrollerProxyToPolicyInfo;

    constructor(
        address _policyManager,
        address _addressListRegistry,
        address _valueInterpreter,
        address _wethToken,
        uint256 _bypassableAdaptersListId,
        uint256 _tolerancePeriodDuration,
        uint256 _pricelessAssetBypassTimelock,
        uint256 _pricelessAssetBypassTimeLimit
    )
        public
        PolicyBase(_policyManager)
        PricelessAssetBypassMixin(
            _valueInterpreter,
            _wethToken,
            _pricelessAssetBypassTimelock,
            _pricelessAssetBypassTimeLimit
        )
    {
        ADDRESS_LIST_REGISTRY = _addressListRegistry;
        BYPASSABLE_ADAPTERS_LIST_ID = _bypassableAdaptersListId;
        TOLERANCE_PERIOD_DURATION = _tolerancePeriodDuration;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        uint16 tolerance = abi.decode(_encodedSettings, (uint16));
        require(tolerance < ONE_HUNDRED_PERCENT, "addFundSettings: Max tolerance exceeded");

        comptrollerProxyToPolicyInfo[_comptrollerProxy] = PolicyInfo({
            tolerance: tolerance,
            cumulativeSlippage: 0,
            lastSlippageTimestamp: 0
        });

        emit FundSettingsSet(_comptrollerProxy, tolerance);
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "CUMULATIVE_SLIPPAGE_TOLERANCE";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks()
        external
        pure
        override
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_)
    {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.PostCallOnIntegration;

        return implementedHooks_;
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    /// @dev Requires onlyPolicyManager as it updates state using passed data
    function validateRule(
        address _comptrollerProxy,
        IPolicyManager.PolicyHook,
        bytes calldata _encodedArgs
    ) external override onlyPolicyManager returns (bool isValid_) {
        (
            ,
            address adapter,
            ,
            address[] memory incomingAssets,
            uint256[] memory incomingAssetAmounts,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts
        ) = __decodePostCallOnIntegrationValidationData(_encodedArgs);

        if (__isBypassableAction(adapter)) {
            return true;
        }

        uint256 newSlippage = __calcSlippage(
            _comptrollerProxy,
            incomingAssets,
            incomingAssetAmounts,
            spendAssets,
            spendAssetAmounts
        );
        if (newSlippage == 0) {
            return true;
        }

        uint256 tolerance = comptrollerProxyToPolicyInfo[_comptrollerProxy].tolerance;

        return __updateCumulativeSlippage(_comptrollerProxy, newSlippage, tolerance) <= tolerance;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate slippage
    function __calcSlippage(
        address _comptrollerProxy,
        address[] memory _incomingAssets,
        uint256[] memory _incomingAssetAmounts,
        address[] memory _spendAssets,
        uint256[] memory _spendAssetAmounts
    ) private returns (uint256 slippage_) {
        uint256 outgoingValue = __calcTotalValueExlcudingBypassablePricelessAssets(
            _comptrollerProxy,
            _spendAssets,
            _spendAssetAmounts,
            getPricelessAssetBypassWethToken()
        );

        // In case there are only incoming assets (e.g., claiming rewards), return early
        if (outgoingValue == 0) {
            return 0;
        }

        uint256 incomingValue = __calcTotalValueExlcudingBypassablePricelessAssets(
            _comptrollerProxy,
            _incomingAssets,
            _incomingAssetAmounts,
            getPricelessAssetBypassWethToken()
        );

        if (outgoingValue > incomingValue) {
            uint256 loss = outgoingValue.sub(incomingValue);

            return loss.mul(ONE_HUNDRED_PERCENT).div(outgoingValue);
        }

        return 0;
    }

    /// @dev Helper to determine if an adapter is bypassable
    function __isBypassableAction(address _adapter) private view returns (bool isBypassable_) {
        return
            AddressListRegistry(getAddressListRegistry()).isInList(
                getBypassableAdaptersListId(),
                _adapter
            );
    }

    /// @dev Helper to update the cumulative slippage for a given fund.
    /// The stored `cumulativeSlippage` is replenished at a constant rate,
    /// relative to the fund's tolerance over the TOLERANCE_PERIOD_DURATION.
    function __updateCumulativeSlippage(
        address _comptrollerProxy,
        uint256 _newSlippage,
        uint256 _tolerance
    ) private returns (uint256 nextCumulativeSlippage_) {
        PolicyInfo storage policyInfo = comptrollerProxyToPolicyInfo[_comptrollerProxy];

        nextCumulativeSlippage_ = policyInfo.cumulativeSlippage;

        // Deduct the slippage that is replenishable given the previous slippage timestamp
        if (nextCumulativeSlippage_ > 0) {
            uint256 cumulativeSlippageToRestore = _tolerance
                .mul(block.timestamp.sub(policyInfo.lastSlippageTimestamp))
                .div(getTolerancePeriodDuration());
            if (cumulativeSlippageToRestore < nextCumulativeSlippage_) {
                nextCumulativeSlippage_ = nextCumulativeSlippage_.sub(cumulativeSlippageToRestore);
            } else {
                nextCumulativeSlippage_ = 0;
            }
        }

        // Add the new slippage
        nextCumulativeSlippage_ = nextCumulativeSlippage_.add(_newSlippage);

        policyInfo.cumulativeSlippage = uint16(nextCumulativeSlippage_);
        policyInfo.lastSlippageTimestamp = uint128(block.timestamp);

        emit CumulativeSlippageUpdatedForFund(_comptrollerProxy, nextCumulativeSlippage_);

        return nextCumulativeSlippage_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `ADDRESS_LIST_REGISTRY` variable
    /// @return addressListRegistry_ The `ADDRESS_LIST_REGISTRY` variable value
    function getAddressListRegistry() public view returns (address addressListRegistry_) {
        return ADDRESS_LIST_REGISTRY;
    }

    /// @notice Gets the `BYPASSABLE_ADAPTERS_LIST_ID` variable
    /// @return bypassableAdaptersListId_ The `BYPASSABLE_ADAPTERS_LIST_ID` variable value
    function getBypassableAdaptersListId()
        public
        view
        returns (uint256 bypassableAdaptersListId_)
    {
        return BYPASSABLE_ADAPTERS_LIST_ID;
    }

    /// @notice Gets the PolicyInfo for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return policyInfo_ The PolicyInfo values
    function getPolicyInfoForFund(address _comptrollerProxy)
        public
        view
        returns (PolicyInfo memory policyInfo_)
    {
        return comptrollerProxyToPolicyInfo[_comptrollerProxy];
    }

    /// @notice Gets the `TOLERANCE_PERIOD_DURATION` variable
    /// @return tolerancePeriodDuration_ The `TOLERANCE_PERIOD_DURATION` variable value
    function getTolerancePeriodDuration() public view returns (uint256 tolerancePeriodDuration_) {
        return TOLERANCE_PERIOD_DURATION;
    }
}
