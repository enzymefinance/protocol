pragma solidity ^0.4.21;

import "../dependencies/math.sol";
import "../dependencies/token/BurnableToken.sol";
import "../prices/PriceSource.sol";
import "../version/Version.i.sol";

// TODO: integrate so we do not need all of the constructor params
/// @notice Liquidity contract and token sink
contract Engine is DSMath {
    uint public frozenEther;
    uint public liquidEther;
    uint public lastThaw;
    uint public THAWING_DELAY;
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
        lastThaw = block.timestamp;
        THAWING_DELAY = _delay;
        mlnToken = BurnableToken(_mlnAddress);
    }

    // TODO: convert to a continuous function
    function premiumPercent() view returns (uint) {
        if (liquidEther < 1 ether) {
            return 0;
        } else if (liquidEther >= 1 ether && liquidEther < 5 ether) {
            return 5;
        } else if (liquidEther >= 5 ether && liquidEther < 10 ether) {
            return 10;
        } else if (liquidEther >= 10 ether) {
            return 15;
        }
    }

    function payAmguInEther() public payable {
        require(version.isFund(msg.sender) || version.isFundFactory(msg.sender));
        frozenEther = add(frozenEther, msg.value);
    }

    // TODO: revisit need for a delay now that only funds can do this
    /// @notice Move frozen ether to liquid pool after delay
    /// @dev Delay only restarts when this function is called
    function thaw() public {
        require((block.timestamp >= add(lastThaw, THAWING_DELAY)));
        require(frozenEther > 0);
        lastThaw = block.timestamp;
        liquidEther = add(liquidEther, frozenEther);
        frozenEther = 0;
    }

    /// @return ETH per MLN including premium
    function enginePrice() public view returns (uint) {
        uint ethPerMln;
        (ethPerMln, ) = priceSource.getPrice(address(mlnToken));
        uint premium = mul(ethPerMln, (premiumPercent() / 100));
        return add(ethPerMln, premium);
    }

    function ethPayoutForMlnAmount(uint mlnAmount) public view returns (uint) {
        return mul(mlnAmount, enginePrice()) / 10 ** MLN_DECIMALS;
    }

    /// @notice MLN must be approved first
    function sellAndBurnMln(uint mlnAmount) public {
        require(version.isFund(msg.sender));
        require(mlnToken.transferFrom(msg.sender, address(this), mlnAmount));
        uint ethToSend = ethPayoutForMlnAmount(mlnAmount);
        require(ethToSend > 0);
        require(liquidEther >= ethToSend);
        msg.sender.send(ethToSend);
        mlnToken.burn(mlnAmount);
    }
}

