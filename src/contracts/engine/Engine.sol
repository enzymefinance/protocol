pragma solidity ^0.4.21;

import "ERC20.sol";

/// @notice Contract
contract Engine {
    address version;
    address priceSource;
    uint frozenEther;
    uint liquidEther;
    uint lastStoke;
    uint STOKING_DELAY;
    ERC20 mlnToken;


    constructor(
        address _version,
        address _priceSource,
        uint _delay,
        address _mlnAddress
    ){
        version = _version;
        priceSource = _priceSource;
        lastStoke = block.timestamp;
        STOKING_DELAY = _delay;
        mlnToken = ERC20(_mlnAddress);
    }

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

    function enginePrice() view returns (uint) {
        uint ethPerMln = priceSource.getPrice(mlnAddress);
        uint premium = mul(ethPerMln, (premiumPercent / 100));
        return add(ethPerMln, premium);
    }

    function sellAndBurnMln(uint mlnAmount) {
        require(mlnToken.transfer(address(this), mlnAmount));
        uint ethPriceWithPremium = enginePrice();
        uint ethToSend = mul(mlnAmount, enginePrice());
        msg.sender.send(ethToSend);
        mlnToken.burn(mlnAmount);
    }
}

