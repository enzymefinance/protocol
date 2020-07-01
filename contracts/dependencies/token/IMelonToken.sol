import "./IERC20.sol";

/// @title Melon Token Interface
/// @author Melon Council DAO <security@meloncouncil.io>
interface IMelonToken is IERC20 {
    function burn(uint256) external;
}
