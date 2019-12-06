pragma solidity 0.4.18;


import "./Withdrawable.sol";
import "./WhiteListInterface.sol";
import "./ERC20Interface.sol";


contract WhiteList is WhiteListInterface, Withdrawable {

    uint public weiPerSgd; // amount of weis in 1 singapore dollar
    mapping (address=>uint) public userCategory; // each user has a category defining cap on trade. 0 for standard.
    mapping (uint=>uint)    public categoryCap;  // will define cap on trade amount per category in singapore Dollar.
    uint constant public kgtHolderCategory = 2;
    ERC20 public kgtToken;

    function WhiteList(address _admin, ERC20 _kgtToken) public {
        require(_admin != address(0));
        require(_kgtToken != address(0));
        kgtToken = _kgtToken;
        admin = _admin;
    }

    function getUserCapInWei(address user) external view returns (uint) {
        uint category = getUserCategory(user);
        return (categoryCap[category] * weiPerSgd);
    }

    event UserCategorySet(address user, uint category);

    function setUserCategory(address user, uint category) public onlyOperator {
        userCategory[user] = category;
        UserCategorySet(user, category);
    }

    event CategoryCapSet (uint category, uint sgdCap);

    function setCategoryCap(uint category, uint sgdCap) public onlyOperator {
        categoryCap[category] = sgdCap;
        CategoryCapSet(category, sgdCap);
    }

    event SgdToWeiRateSet (uint rate);

    function setSgdToEthRate(uint _sgdToWeiRate) public onlyOperator {
        weiPerSgd = _sgdToWeiRate;
        SgdToWeiRateSet(_sgdToWeiRate);
    }

    function getUserCategory (address user) public view returns(uint) {
        uint category = userCategory[user];
        if (category == 0) {
            //0 = default category. means category wasn't set.
            if (kgtToken.balanceOf(user) > 0) {
                category = kgtHolderCategory;
            }
        }
        return category;
    }
}
