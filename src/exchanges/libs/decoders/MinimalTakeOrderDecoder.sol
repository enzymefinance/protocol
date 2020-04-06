pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

/// @title Base contract for exchange adapters sharing the same decoder
/// @author Melonport AG <team@melonport.com>
abstract contract MinimalTakeOrderDecoder {

    /// @notice Decode the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return makerAsset Maker asset
    /// @return makerQuantity Maker asset amount
    /// @return takerAsset Taker asset
    /// @return takerQuantity Taker asset amount
    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address makerAsset,
            uint256 makerQuantity,
            address takerAsset,
            uint256 takerQuantity
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address,
                uint256,
                address,
                uint256
            )
        );
    }
}
