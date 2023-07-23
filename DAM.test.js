require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-toolbox");
const { ethers } = require("hardhat");
const { expect } = require("chai");

const sharePercent = 50;
const asset1Name = "Asset 1";
const asset1Price = ethers.parseEther("0.2");
let asset1Index;

describe("Checking market initial state", async () => {
  let myMarket, provider;

  before(async () => {
    provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545");
    const Market = await ethers.getContractFactory("DigitalAssetMarket");
    myMarket = await Market.deploy(sharePercent);
  });

  it("Check share percent", async () => {
    expect(await myMarket.getFunction("sharePercent").call()).to.be.equal(
      sharePercent
    );
  });

  it("Check that market is empty", async () => {
    expect(await myMarket.assetsCount()).to.be.equal(0);
  });

  it("Check that market balance is zero", async () => {
    expect(await provider.getBalance(await myMarket.getAddress())).to.be.equal(
      0
    );
  });
});

describe("Checking market business", () => {
  let myMarket, owner, seller, buyer, provider;

  before(async () => {
    provider = new ethers.JsonRpcProvider("http://localhost:7545");
    const Market = await ethers.getContractFactory("DigitalAssetMarket");
    myMarket = await Market.deploy(sharePercent);
    const accounts = await ethers.getSigners();
    owner = accounts[0];
    seller = accounts[1];
    buyer = accounts[2];
  });

  it("Seller add asset to market", async () => {
    const txPromise = await myMarket
      .connect(seller)
      .addAsset(asset1Name, asset1Price);
    const txReceipt = await txPromise.wait();
    const newAssetEvent = await myMarket.queryFilter("NewAsset");
    asset1Index = newAssetEvent[0].args[2];
  });

  it("Asset must added to market", async () => {
    expect(await myMarket.assetsCount()).equal(1);
    const asset1 = await myMarket.assetData(Number(asset1Index));
    expect(asset1[0]).to.be.equal(asset1Name);
    expect(asset1[1]).to.be.equal(asset1Price);
    expect(asset1[2]).to.be.equal(asset1Index);
  });

  it("Unathorized access to assets data are prohabitted", async () => {
    expect(myMarket.connect(seller).assetData(asset1Index)).to.be.revertedWith(
      "Only market owner can call this method!"
    );
  });

  it("Buyer can noy buy asset with incorrect value", async () => {
    (
      await expect(
        myMarket.connect(buyer).buy(asset1Index, {
          value: ethers.parseEther("0.0001"),
        })
      )
    ).to.be.revertedWith("Value and price are different!");
  });

  it("Buyer can not buy a product with an invalid index", async () => {
    (
      await expect(
        myMarket.connect(buyer).buy(100, {
          value: asset1Price,
        })
      )
    ).to.be.revertedWith("The asset reference is not valid!");
  });

  it("Buyer can buy asset with correct value", async () => {
    const buyerStartingBalance = await provider.getBalance(buyer.address);
    const sellerStartingBalance = await provider.getBalance(seller.address);

    const txPromise = myMarket.connect(buyer).buy(asset1Index, {
      value: asset1Price,
    });
    const txReceipt = await txPromise;
    await expect(txPromise).not.to.be.reverted;
    const trx = await provider.getTransactionReceipt(txReceipt.hash);
    const buyerChangedBalance = await provider.getBalance(buyer.address);
    // const sellerChangedBalance = await provider.getBalance(seller.address);

    expect(buyerChangedBalance).to.be.equal(
      buyerStartingBalance - trx.gasUsed * trx.gasPrice - asset1Price
    );
    expect(await provider.getBalance(await myMarket.getAddress())).to.be.equal(
      (asset1Price * BigInt(sharePercent)) / 100n
    );
    expect(await provider.getBalance(seller.address)).to.be.equal(
      sellerStartingBalance + (asset1Price * BigInt(100 - sharePercent)) / 100n
    );
  });

  it("Seller and buyer must be different", async () => {
    (
      await expect(
        myMarket.connect(seller).buy(asset1Index, {
          value: asset1Price,
        })
      )
    ).to.be.revertedWith("This item is yours!");
  });

  it("An item cannot be sold twice", async () => {
    expect(
      myMarket.connect(buyer).buy(asset1Index, {
        value: asset1Price,
      })
    ).to.be.revertedWith("This item is not for sale!");
  });

  it("Only market owner can withdraw money", async () => {
    expect(
      myMarket.connect(seller).withdraw(ethers.parseEther("0.01"))
    ).to.be.revertedWith("Only market owner can withdraw money!");
  });

  it("Withdrawn amount must be gt 0 and lte market balance", async () => {
    expect(myMarket.withdraw(asset1Price)).to.be.revertedWith(
      "Not acceptable money value!"
    );
  });

  it("Owner can withdraw market balance", async () => {
    const ownerStartingBalance = await provider.getBalance(
      await owner.getAddress()
    );
    const marketStartingBalance = await provider.getBalance(
      await myMarket.getAddress()
    );

    const txPromise = await myMarket.withdraw(
      (asset1Price * BigInt(100 - sharePercent)) / 100n
    );
    const txReceipt = await txPromise;
    await expect(txPromise).not.to.be.reverted;
    const trx = await provider.getTransactionReceipt(txReceipt.hash);
    const ownerNewBalance = await provider.getBalance(await owner.getAddress());
    expect(ownerNewBalance).to.be.equal(
      ownerStartingBalance + marketStartingBalance - trx.gasUsed * trx.gasPrice
    );
  });
});
