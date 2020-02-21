pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../../dependencies/DSMath.sol";
import "../../dependencies/token/IERC20.sol";
import "../../fund/accounting/IAccounting.sol";
import "../../fund/trading/ITrading.sol";
import "../../version/IRegistry.sol";

/// @title Exchange Adapter base contract
/// @author Melonport AG <team@melonport.com>
/// @notice Override the public methods to implement an adapter
contract ExchangeAdapter is DSMath {

    // EXTERNAL FUNCTIONS

    /// @notice Extract arguments for risk management validations
    /// @param _encodedArgs Encoded arguments for a specific exchange
    /// @notice rskMngAddrs [0] makerAddress
    /// @notice rskMngAddrs [1] takerAddress
    /// @notice rskMngAddrs [2] makerAsset
    /// @notice rskMngAddrs [3] takerAsset
    /// @notice rskMngAddrs [4] makerFeeAsset
    /// @notice rskMngAddrs [5] takerFeeAsset
    /// @notice rskMngVals [0] makerAssetAmount
    /// @notice rskMngVals [1] takerAssetAmount
    /// @notice rskMngVals [2] fillAmout
    function extractRiskManagementArgs(
        bytes calldata _encodedArgs
    )
        external
        pure
        virtual
        returns (address[6] memory, uint[3] memory)
    {
        revert("Unimplemented");
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
    // - Validate arguments (via a __validateTakeOrderParams function)
    // - Prepare a formatted list of assets and expected fill amounts
    // (via a __formatFillTakeOrderArgs function)
    // - Fill an order on the _targetExchange, via a __fillTakeOrder function
    // that uses the validateAndFinalizeFilledOrder modifier
    function takeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    ) public virtual { revert("Unimplemented"); }

    // INTERNAL FUNCTIONS

    // Increment allowance of an asset for some target
    function __approveAsset(
        address _asset,
        address _target,
        uint256 _amount,
        string memory _assetType
    )
        internal
    {
        require(
            __getAccounting().assetBalances(_asset) >= _amount,
            string(abi.encodePacked("Insufficient available assetBalance: ", _assetType))
        );

        uint256 allowance = IERC20(_asset).allowance(address(this), _target);
        require(
            IERC20(_asset).approve(_target, add(allowance, _amount)),
            string(abi.encodePacked("Approval failed: ", _assetType))
        );
    }

    function __getAccounting() internal view returns (IAccounting) {
        return IAccounting(__getTrading().routes().accounting);
    }

    function __getNativeAssetAddress() internal view returns (address) {
        return __getRegistry().nativeAsset();
    }

    function __getMlnTokenAddress() internal view returns (address) {
        return __getRegistry().mlnToken();
    }

    function __getRegistry() internal view returns (IRegistry) {
        return IRegistry(__getTrading().routes().registry);
    }

    function __getTrading() internal view returns (ITrading) {
        return ITrading(payable(address(this)));
    }
}
