const User = require("../../model/userSchema");
const Address = require("../../model/AddressScheema");
const mongoose = require("mongoose");
const logger = require("../../utils/logger");

const address = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    const userAddresses = await Address.find({ userId: req.user._id }).lean();

    res.render("address", {
      addresses: userAddresses,
      fullname: user.fullname || "User",
    });
  } catch (error) {
    logger.error("Unable to get address page:", error.message);
    res.status(500).redirect("/page-404/");
  }
};

const getaddAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();

    res.render("addressAdding", {
      fullname: user.fullname || "User",
    });
  } catch (error) {
    logger.error("Unable to get the add address page:", error.message);
    res.status(500).redirect("/page-404/");
  }
};

const addAddress = async (req, res) => {
  try {
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

    if (
      !fullname ||
      !mobile ||
      !address ||
      !district ||
      !city ||
      !state ||
      !pincode
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "All required fields must be provided",
        });
    }

    const typeMap = {
      home: "Home",
      work: "Office",
      office: "Office",
      other: "Other",
    };
    const normalizedType = typeMap[type?.toLowerCase()] || "Home";
    if (!["Home", "Office", "Other"].includes(normalizedType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address type" });
    }

    const existingAddresses = await Address.countDocuments({
      userId: req.user._id,
    });
    const isDefault = existingAddresses === 0;

    const newAddress = new Address({
      userId: req.user._id,
      fullname,
      mobile,
      address,
      district,
      city,
      state,
      pincode,
      landmark: landmark || "",
      type: normalizedType,
      isDefault,
    });

    await newAddress.save();

    res.status(201).json({
      success: true,
      message: "User address created successfully",
      address: newAddress,
    });
  } catch (error) {
    logger.error("Unable to add address:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to add address",
      error: error.message,
    });
  }
};

const geteditAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).redirect("/address");
    }

    const address = await Address.findOne({
      _id: addressId,
      userId: req.user._id,
    }).lean();
    if (!address) {
      return res.status(404).redirect("/address");
    }

    res.render("editAddress", { address });
  } catch (error) {
    logger.error("Unable to get the user address edit page:", error.message);
    res.status(500).redirect("/page-404/");
  }
};

const updateAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
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

    const existingAddress = await Address.findOne({
      _id: addressId,
      userId: req.user._id,
    });
    if (!existingAddress) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found or unauthorized" });
    }

    const typeMap = {
      home: "Home",
      work: "Office",
      office: "Office",
      other: "Other",
    };
    const normalizedType = typeMap[type?.toLowerCase()] || "Home";

    const hasChanges =
      existingAddress.fullname !== fullname ||
      existingAddress.mobile !== mobile ||
      existingAddress.address !== address ||
      existingAddress.district !== district ||
      existingAddress.city !== city ||
      existingAddress.state !== state ||
      existingAddress.pincode !== pincode ||
      existingAddress.landmark !== (landmark || "") ||
      existingAddress.type !== normalizedType;

    if (!hasChanges) {
      return res
        .status(200)
        .json({ success: false, message: "No changes made" });
    }

    const updatedAddress = await Address.findOneAndUpdate(
      { _id: addressId, userId: req.user._id },
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
      return res
        .status(404)
        .json({ success: false, message: "Address not found or unauthorized" });
    }

    return res.status(200).json({
      success: true,
      message: "Your address has been updated successfully",
      address: updatedAddress,
    });
  } catch (error) {
    logger.error("Update address error:", error.message);
    return res.status(500).json({
      success: false,
      message:
        "An error occurred while updating the address. Please try again.",
      error: error.message,
    });
  }
};

const removeAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    const deletedAddress = await Address.findOneAndDelete({
      _id: addressId,
      userId: req.user._id,
    });

    if (!deletedAddress) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found or unauthorized" });
    }

    res.status(200).json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (error) {
    logger.error("Unable to delete address:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete address",
      error: error.message,
    });
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address ID" });
    }

    await Address.updateMany({ userId: req.user._id }, { isDefault: false });

    const updatedAddress = await Address.findOneAndUpdate(
      { _id: addressId, userId: req.user._id },
      { isDefault: true },
      { new: true }
    );

    if (!updatedAddress) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found or unauthorized" });
    }

    res.status(200).json({
      success: true,
      message: "Default address updated successfully",
    });
  } catch (error) {
    logger.error("Unable to set default address:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to set default address",
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
  removeAddress,
  setDefaultAddress,
};
