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
    event OrderFilled(
        address indexed exchangeAddress,
        OrderType indexed orderType,
        address targetAsset,
        uint256 targetAmount,
        address offerAsset,
        uint256 offerAmount,
        address[] feeAssets,
        uint256[] feeAmounts
    );
    enum OrderType { Take }

    modifier onlyManager() {
        require(
            getHub().manager() == msg.sender,
            "Manager must be sender"
        );
        _;
    }

    modifier notShutDown() {
        require(
            !getHub().isShutDown(),
            "Hub must not be shut down"
        );
        _;
    }

    // PUBLIC FUNCTIONS

    /// @param _orderAddresses [0] Order maker
    /// @param _orderAddresses [1] Order taker
    /// @param _orderAddresses [2] Order maker asset
    /// @param _orderAddresses [3] Order taker asset
    /// @param _orderAddresses [4] feeRecipientAddress
    /// @param _orderAddresses [5] senderAddress
    /// @param _orderAddresses [6] maker fee asset
    /// @param _orderAddresses [7] taker fee asset
    /// @param _orderValues [0] makerAssetAmount
    /// @param _orderValues [1] takerAssetAmount
    /// @param _orderValues [2] Maker fee
    /// @param _orderValues [3] Taker fee
    /// @param _orderValues [4] expirationTimeSeconds
    /// @param _orderValues [5] Salt/nonce
    /// @param _orderValues [6] Fill amount: amount of taker token to be traded
    /// @param _orderValues [7] Dexy signature mode
    /// @param _orderData [0] Encoded data specific to maker asset
    /// @param _orderData [1] Encoded data specific to taker asset
    /// @param _orderData [2] Encoded data specific to maker asset fee
    /// @param _orderData [3] Encoded data specific to taker asset fee
    /// @param _identifier Order identifier
    /// @param _signature Signature of order maker

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
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    ) public virtual { revert("Unimplemented"); }

    // INTERNAL FUNCTIONS

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

    function getAccounting() internal view returns (Accounting) {
        return Accounting(getHub().accounting());
    }

    function getHub() internal view returns (Hub) {
        return Hub(getTrading().hub());
    }

    function getTrading() internal view returns (Trading) {
        return Trading(payable(address(this)));
    }
}
