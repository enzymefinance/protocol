pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

abstract contract MinimalTakeOrderDecoder {

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
