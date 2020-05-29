pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

/// @title Spoke Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface ISpoke {
    function HUB() external view returns (address);
}
