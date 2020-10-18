// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../core/fund/vault/VaultLib.sol";
import "../../../../infrastructure/value-interpreter/ValueInterpreter.sol";
import "../../../../interfaces/IUniswapV2Factory.sol";
import "../../../../interfaces/IUniswapV2Pair.sol";
import "./utils/BuySharesPreValidatePolicyBase.sol";

/// @title BuySharesPriceFeedTolerance
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Validates that the fund GAV according to the price feed does not significantly
/// deviate from the values that can be derived from Uniswap pools
contract BuySharesPriceFeedTolerance is BuySharesPreValidatePolicyBase {
    using SafeMath for uint256;

    event ToleranceSetForFund(address indexed comptrollerProxy, uint256 nextTolerance);

    uint256 private constant TOLERANCE_DIVISOR = 10**18;
    uint256 private constant WETH_UNIT = 10**18;
    address private immutable UNISWAP_FACTORY;
    address private immutable VALUE_INTERPRETER;
    address private immutable WETH_TOKEN;

    mapping(address => uint256) private comptrollerProxyToTolerance;

    constructor(
        address _policyManager,
        address _uniswapFactory,
        address _valueInterpreter,
        address _wethToken
    ) public PolicyBase(_policyManager) {
        UNISWAP_FACTORY = _uniswapFactory;
        VALUE_INTERPRETER = _valueInterpreter;
        WETH_TOKEN = _wethToken;
    }

    /// @notice Add the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        __setTolerance(_comptrollerProxy, _encodedSettings);
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifer string
    function identifier() external override pure returns (string memory identifier_) {
        return "BUY_SHARES_PRICE_FEED_TOLERANCE";
    }

    /// @notice Checks whether a particular condition passes the rule for a particular fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @return isValid_ True if the rule passes
    function passesRule(address _comptrollerProxy, uint256 _gav) public returns (bool isValid_) {
        ComptrollerLib comptrollerProxyContract = ComptrollerLib(_comptrollerProxy);
        VaultLib vaultProxyContract = VaultLib(comptrollerProxyContract.getVaultProxy());

        // Return early if there are no tracked assets in the fund
        address[] memory trackedAssets = vaultProxyContract.getTrackedAssets();
        if (trackedAssets.length == 0) {
            return true;
        }

        // If denomination asset is not weth, convert gav to weth
        address denominationAsset = comptrollerProxyContract.getDenominationAsset();
        uint256 wethGav;
        if (denominationAsset == WETH_TOKEN) {
            wethGav = _gav;
        } else {
            bool wethGavIsValid;
            (wethGav, wethGavIsValid) = ValueInterpreter(VALUE_INTERPRETER)
                .calcCanonicalAssetValue(denominationAsset, _gav, WETH_TOKEN);

            if (!wethGavIsValid) {
                return false;
            }
        }

        // Aggregate the Uniswap-derived values of all tracked assets in the fund
        uint256 uniswapWethGav;
        for (uint256 i; i < trackedAssets.length; i++) {
            (uint256 wethValue, bool isValid) = __calcUniswapWethValueForTrackedAsset(
                vaultProxyContract,
                trackedAssets[i]
            );
            // If any pool is invalid, must return false
            if (!isValid) {
                return false;
            }
            uniswapWethGav = uniswapWethGav.add(wethValue);
        }

        // True if the the wethGav is greater than the Uniswap-derived wethGav,
        // or if the deviation is less than the tolerance threshold.
        // The first condition is redundant but saves gas if it can exit early.
        return
            wethGav >= uniswapWethGav ||
            uniswapWethGav <=
            wethGav.add(
                wethGav.mul(comptrollerProxyToTolerance[_comptrollerProxy]).div(TOLERANCE_DIVISOR)
            );
    }

    /// @dev Helper to calculate the Uniswap-derived value of an asset in terms of WETH
    function __calcUniswapWethValueForTrackedAsset(VaultLib _vaultProxyContract, address _asset)
        private
        view
        returns (uint256 wethValue_, bool isValid_)
    {
        IERC20 assetContract = IERC20(_asset);
        uint256 vaultAssetBalance = assetContract.balanceOf(address(_vaultProxyContract));

        // If the asset is WETH, return early
        if (_asset == WETH_TOKEN) {
            return (vaultAssetBalance, true);
        }

        // Get the balances of the _asset-WETH Uniswap pool
        address uniswapPair = IUniswapV2Factory(UNISWAP_FACTORY).getPair(_asset, WETH_TOKEN);
        if (uniswapPair == address(0)) {
            return (0, false);
        }
        uint256 uniswapAssetBalance;
        uint256 uniswapWethBalance;
        if (IUniswapV2Pair(uniswapPair).token0() == _asset) {
            (uniswapAssetBalance, uniswapWethBalance, ) = IUniswapV2Pair(uniswapPair)
                .getReserves();
        } else {
            (uniswapWethBalance, uniswapAssetBalance, ) = IUniswapV2Pair(uniswapPair)
                .getReserves();
        }

        return (vaultAssetBalance.mul(uniswapWethBalance).div(uniswapAssetBalance), true);
    }

    /// @notice Update the policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    function updateFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        __setTolerance(_comptrollerProxy, _encodedSettings);
    }

    /// @notice Apply the rule with specified parameters, in the context of a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @return isValid_ True if the rule passes
    function validateRule(address _comptrollerProxy, bytes calldata _encodedArgs)
        external
        override
        returns (bool isValid_)
    {
        (, , , uint256 gav) = __decodeRuleArgs(_encodedArgs);
        return passesRule(_comptrollerProxy, gav);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to set tolerance for a fund
    function __setTolerance(address _comptrollerProxy, bytes memory _encodedSettings) private {
        uint256 nextTolerance = abi.decode(_encodedSettings, (uint256));

        comptrollerProxyToTolerance[_comptrollerProxy] = nextTolerance;

        emit ToleranceSetForFund(_comptrollerProxy, nextTolerance);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the gav tolerance for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return tolerance_ The tolerance
    function getToleranceForFund(address _comptrollerProxy)
        external
        view
        returns (uint256 tolerance_)
    {
        return comptrollerProxyToTolerance[_comptrollerProxy];
    }

    /// @notice Gets the `UNISWAP_FACTORY` variable
    /// @return uniswapFactory_ The `UNISWAP_FACTORY` variable value
    function getUniswapFactory() external view returns (address uniswapFactory_) {
        return UNISWAP_FACTORY;
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() external view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
