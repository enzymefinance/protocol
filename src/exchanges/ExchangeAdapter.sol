pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../dependencies/DSMath.sol";
import "../dependencies/token/IERC20.sol";
import "../fund/accounting/Accounting.sol";
import "../fund/hub/Hub.sol";
import "../fund/trading/Trading.sol";

/// @title Exchange Adapter base contract
/// @author Melonport AG <team@melonport.com>
/// @notice Override the public methods to implement an adapter
contract ExchangeAdapter is DSMath {
    modifier onlyManager() {
        require(
            getManager() == msg.sender,
            "Manager must be sender"
        );
        _;
    }

    modifier notShutDown() {
        require(
            !hubShutDown(),
            "Hub must not be shut down"
        );
        _;
    }

    function getTrading() internal view returns (Trading) {
        return Trading(payable(address(this)));
    }

    function getHub() internal view returns (Hub) {
        return Hub(getTrading().hub());
    }

    function getAccounting() internal view returns (Accounting) {
        return Accounting(getHub().accounting());
    }

    function hubShutDown() internal view returns (bool) {
        return getHub().isShutDown();
    }

    function getManager() internal view returns (address) {
        return getHub().manager();
    }

    /// @notice Increment allowance of an asset for some target
    function approveAsset(
        address _asset,
        address _target,
        uint256 _amount,
        string memory _assetType
    )
        internal
    {
        require(
            getAccounting().assetBalances(_asset) >= _amount,
            string(abi.encodePacked("Insufficient available assetBalance: ", _assetType))
        );

        uint256 allowance = IERC20(_asset).allowance(address(this), _target);
        require(
            IERC20(_asset).approve(_target, add(allowance, _amount)),
            string(abi.encodePacked("Approval failed: ", _assetType))
        );
    }

    /// @param orderAddresses [0] Order maker
    /// @param orderAddresses [1] Order taker
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderAddresses [4] feeRecipientAddress
    /// @param orderAddresses [5] senderAddress
    /// @param orderAddresses [6] maker fee asset
    /// @param orderAddresses [7] taker fee asset
    /// @param orderValues [0] makerAssetAmount
    /// @param orderValues [1] takerAssetAmount
    /// @param orderValues [2] Maker fee
    /// @param orderValues [3] Taker fee
    /// @param orderValues [4] expirationTimeSeconds
    /// @param orderValues [5] Salt/nonce
    /// @param orderValues [6] Fill amount: amount of taker token to be traded
    /// @param orderValues [7] Dexy signature mode
    /// @param orderData [0] Encoded data specific to maker asset
    /// @param orderData [1] Encoded data specific to taker asset
    /// @param orderData [2] Encoded data specific to maker asset fee
    /// @param orderData [3] Encoded data specific to taker asset fee
    /// @param identifier Order identifier
    /// @param signature Signature of order maker

    // Responsibilities of takeOrder are:
    // - check sender
    // - check fund not shut down
    // - check not buying own fund tokens
    // - check price exists for asset pair
    // - check price is recent
    // - check price passes risk management
    // - approve funds to be traded (if necessary)
    // - take order from the exchange
    // - check order was taken (if possible)
    function takeOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public virtual { revert("Unimplemented"); }
}
