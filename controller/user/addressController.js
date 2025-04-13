const User = require("../../model/userSChema");
const Address = require("../../model/AddressScheema");
const mongoose = require('mongoose');

const address = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).redirect("/login");
    }


    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(404).redirect("/login");
    }

  
    const userAddresses = await Address.find({ userId: req.user._id }).lean();

   
    res.render("address", {
      addresses: userAddresses,
      fullname: user.fullname || 'User' 
    });
  } catch (error) {
    console.error("Unable to get address page:", error.message);
    res.status(500).redirect("/page-404/");
  }
};



const getaddAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(404).redirect("/login");
    }

    res.render("addressAdding",{
        fullname: user.fullname || 'User' 
    });
  } catch (error) {
    console.error("Unable to get the add address page:", error.message);
    res.status(500).redirect("/page-404/");
  }
};

const addAddress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: User not logged in" });
    }

    const {
      fullname,
      mobile,
      address,
      district,
      city,
      state,
      pincode,
      landmark,
      type,
    } = req.body;

    if (!fullname || !mobile || !address || !district || !city || !state || !pincode) {
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }

    const typeMap = {
      home: "Home",
      work: "Office",
      office: "Office",
      other: "Other",
    };
    const normalizedType = typeMap[type?.toLowerCase()] || "Home";
    if (!["Home", "Office", "Other"].includes(normalizedType)) {
      return res.status(400).json({ success: false, message: "Invalid address type" });
    }

    const newAddress = new Address({
      userId,
      fullname,
      mobile,
      address,
      district,
      city,
      state,
      pincode,
      landmark: landmark || "",
      type: normalizedType,
    });

    await newAddress.save();

    res.status(201).json({
      success: true,
      message: "User address created successfully",
      address: newAddress,
    });
  } catch (error) {
    console.error("Unable to add address:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to add address",
      error: error.message,
    });
  }
};

const geteditAddress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).redirect("/login");
    }

    const addressId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).redirect("/address");
    }

    const address = await Address.findOne({ _id: addressId, userId }).lean();
    if (!address) {
      return res.status(404).redirect("/address");
    }

    res.render("editAddress", { address });
  } catch (error) {
    console.error("Unable to get the user address edit page:", error.message);
    res.status(500).redirect("/page-404/");
  }
};

const updateAddress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not logged in" });
    }

    const addressId = req.params.id;
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: "Invalid or missing address ID" });
    }

    const {
      fullname,
      mobile,
      address,
      district,
      city,
      state,
      pincode,
      landmark,
      type,
    } = req.body;

    if (!fullname || !mobile || !address || !district || !city || !state || !pincode) {
      return res.status(400).json({ success: false, message: "All required fields are required" });
    }

    const typeMap = {
      home: "Home",
      work: "Office",
      office: "Office",
      other: "Other",
    };
    const normalizedType = typeMap[type?.toLowerCase()] || "Home";
    if (!["Home", "Office", "Other"].includes(normalizedType)) {
      return res.status(400).json({ success: false, message: "Invalid address type" });
    }

    const updatedAddress = await Address.findOneAndUpdate(
      { _id: addressId, userId },
      {
        fullname,
        mobile,
        address,
        district,
        city,
        state,
        pincode,
        landmark: landmark || "",
        type: normalizedType,
      },
      { new: true, runValidators: true }
    );

    if (!updatedAddress) {
      return res.status(404).json({ success: false, message: "Address not found or unauthorized" });
    }

    res.status(200).json({
      success: true,
      message: "Address updated successfully",
      address: updatedAddress,
    });
  } catch (error) {
    console.error("Unable to update address:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update address",
      error: error.message,
    });
  }
};

module.exports = {
  getaddAddress,
  address,
  addAddress,
  geteditAddress,
  updateAddress,
};  