pragma solidity 0.6.4;

import "../dependencies/token/BurnableToken.sol";
import "../prices/IPriceSource.sol";
import "../registry/IRegistry.sol";

interface IEngine {
    // STORAGE
    function amguPrice() external view returns (uint256);
    function frozenEther() external view returns (uint256);
    function lastThaw() external view returns (uint256);
    function liquidEther() external view returns (uint256);
    function registry() external view returns (IRegistry);
    function thawingDelay() external view returns (uint256);
    function totalAmguConsumed() external view returns (uint256);
    function totalEtherConsumed() external view returns (uint256);
    function totalMlnBurned() external view returns (uint256);

    // FUNCTIONS
    function enginePrice() external view returns (uint256);
    function ethPayoutForMlnAmount(uint256 mlnAmount) external view returns (uint256);
    function getAmguPrice() external view returns (uint256);
    function mlnToken() external view returns (BurnableToken);
    function payAmguInEther() external payable;
    function premiumPercent() external view returns (uint256);
    function priceSource() external view returns (IPriceSource);
    function sellAndBurnMln(uint256 _mlnAmount) external;
    function thaw() external;

    // Caller: MTC only:
    function setRegistry(address _registry) external;

    // Caller: MGM only:
    function setAmguPrice(uint _price) external;
}
