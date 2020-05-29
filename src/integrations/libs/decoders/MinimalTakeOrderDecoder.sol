pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

/// @title MinimalTakeOrderDecoder Base Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Base contract for exchange adapters sharing the same decoder
abstract contract MinimalTakeOrderDecoder {

    /// @notice Decode the parameters of a takeOrder call
    /// @param _encodedArgs Encoded parameters passed from client side
    /// @return makerAsset_ Maker asset
    /// @return makerQuantity_ Maker asset amount
    /// @return takerAsset_ Taker asset
    /// @return takerQuantity_ Taker asset amount
    function __decodeTakeOrderArgs(
        bytes memory _encodedArgs
    )
        internal
        pure
        returns (
            address makerAsset_,
            uint256 makerQuantity_,
            address takerAsset_,
            uint256 takerQuantity_
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
