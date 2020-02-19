pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

/// @dev Minimal interface for our interactions with the ZeroEx Exchange contract
interface IZeroExV3 {
    struct Order {
        address makerAddress;
        address takerAddress;
        address feeRecipientAddress;
        address senderAddress;
        uint256 makerAssetAmount;
        uint256 takerAssetAmount;
        uint256 makerFee;
        uint256 takerFee;
        uint256 expirationTimeSeconds;
        uint256 salt;
        bytes makerAssetData;
        bytes takerAssetData;
        bytes makerFeeAssetData;
        bytes takerFeeAssetData;
    }

    struct OrderInfo {
        uint8 orderStatus;
        bytes32 orderHash;
        uint256 orderTakerAssetFilledAmount;
    }

    struct FillResults {
        uint256 makerAssetFilledAmount;
        uint256 takerAssetFilledAmount;
        uint256 makerFeePaid;
        uint256 takerFeePaid;
        uint256 protocolFeePaid;
    }

    function cancelled(bytes32) external view returns (bool);
    function cancelOrder(Order calldata) external;
    function filled(bytes32) external view returns (uint256);
    function fillOrder(Order calldata, uint256, bytes calldata) external payable returns (FillResults memory);
    function getAssetProxy(bytes4) external view returns (address);
    function getOrderInfo(Order calldata) external view returns (OrderInfo memory);
    function isValidOrderSignature(Order calldata, bytes calldata) external view returns (bool);
    function preSign(bytes32) external;
    function protocolFeeCollector() external view returns (address);
    function protocolFeeMultiplier() external view returns (uint256);
}
