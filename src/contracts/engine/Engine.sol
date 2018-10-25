pragma solidity ^0.4.21;

import "../dependencies/math.sol";
import "../dependencies/token/BurnableToken.sol";
import "../prices/PriceSource.sol";
import "../version/Version.i.sol";

/// @notice Contract
contract Engine is DSMath {
    uint public frozenEther;
    uint public liquidEther;
    uint public lastStoke;
    uint public STOKING_DELAY;
    BurnableToken public mlnToken;
    PriceSource public priceSource;
    VersionInterface public version;
    uint public MLN_DECIMALS = 18;

    constructor(
        address _version,
        address _priceSource,
        uint _delay,
        address _mlnAddress
    ) {
        version = VersionInterface(_version);
        priceSource = PriceSource(_priceSource);
        lastStoke = block.timestamp;
        STOKING_DELAY = _delay;
        mlnToken = BurnableToken(_mlnAddress);
    }

    // TODO: do we need this check anywhere? if not, remove modifier
    modifier stays_frozen() {
        uint frozenBefore = frozenEther;
        _;
        require(frozenBefore == frozenEther);
    }

    function premiumPercent() view returns (uint) {
        if (liquidEther < 1 ether) {
            return 0;
        } else if (1 ether <= liquidEther && liquidEther < 5 ether) {
            return 5;
        } else if (5 ether <= liquidEther && liquidEther < 10 ether) {
            return 10;
        } else if (10 ether <= liquidEther) {
            return 15;
        }
    }

    /// @notice Move frozen ether to liquid pool after delay
    /// @dev Delay only restarts when this function is called
    function stoke() public {
        require((block.timestamp >= add(lastStoke, STOKING_DELAY)));
        require(frozenEther > 0);
        lastStoke = block.timestamp;
        liquidEther = add(liquidEther, frozenEther);
        frozenEther = 0;
    }

    function payAmguInEther() payable {
        // TODO: implement version.isFund
        require(version.isFund(msg.sender));
        frozenEther = add(frozenEther, msg.value);
    }

    /// @return ETH per MLN including premium
    function enginePrice() view returns (uint) {
        uint ethPerMln;
        (ethPerMln, ) = priceSource.getPrice(address(mlnToken));
        uint premium = mul(ethPerMln, (premiumPercent() / 100));
        return add(ethPerMln, premium);
    }

    function sellAndBurnMln(uint mlnAmount) {
        require(mlnToken.transferFrom(msg.sender, address(this), mlnAmount));
        uint ethToSend = mul(mlnAmount, enginePrice()) / 10 ** MLN_DECIMALS;
        require(ethToSend > 0);
        require(liquidEther >= ethToSend);
        msg.sender.send(ethToSend);
        mlnToken.burn(mlnAmount);
    }
}

