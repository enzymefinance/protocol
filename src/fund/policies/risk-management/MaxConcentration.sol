pragma solidity 0.6.8;

import "../TradingSignatures.sol";
import "../../hub/Spoke.sol";
import "../../shares/Shares.sol";
import "../../vault/Vault.sol";
import "../../../dependencies/DSMath.sol";
import "../../../prices/IPriceSource.sol";

/// @title MaxConcentration Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Validates concentration limitations per asset for its equity of a particular fund
contract MaxConcentration is TradingSignatures, DSMath {
    enum Applied { pre, post }

    uint internal constant ONE_HUNDRED_PERCENT = 10 ** 18;  // 100%
    uint public maxConcentration;

    constructor(uint _maxConcentration) public {
        require(
            _maxConcentration <= ONE_HUNDRED_PERCENT,
            "Max concentration cannot exceed 100%"
        );
        maxConcentration = _maxConcentration;
    }

    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier)
        external
        returns (bool)
    {
        if (sig != TAKE_ORDER) revert("Signature was not TakeOrder");
        IHub hub = IHub(Spoke(msg.sender).HUB());
        Shares shares = Shares(hub.shares());
        address denominationAsset = shares.DENOMINATION_ASSET();
        // Max concentration is only checked for non-quote assets
        address takerToken = addresses[2];
        if (denominationAsset == takerToken) { return true; }

        uint totalGav = shares.calcGav();

        uint256 assetGav = IPriceSource(IRegistry(hub.REGISTRY()).priceSource()).convertQuantity(
            Vault(payable(hub.vault())).assetBalances(takerToken),
            takerToken,
            denominationAsset
        );

        uint concentration = __calcConcentration(assetGav, totalGav);

        return concentration <= maxConcentration;
    }

    function position() external pure returns (Applied) { return Applied.post; }
    function identifier() external pure returns (string memory) { return 'MaxConcentration'; }

    function __calcConcentration(uint assetGav, uint totalGav) internal returns (uint) {
        return mul(assetGav, ONE_HUNDRED_PERCENT) / totalGav;
    }
}
