const User = require('../../model/userSchema');
const Address = require('../../model/AddressScheema'); 
const mongoose = require('mongoose');

const address = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).redirect('/login');
    }

    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(404).redirect('/login');
    }

    const userAddresses = await Address.find({ userId: req.user._id }).lean();

    res.render('address', {
      addresses: userAddresses,
      fullname: user.fullname || 'User',
    });
  } catch (error) {
    console.error('Unable to get address page:', error.message);
    res.status(500).redirect('/page-404/');
  }
};

const getaddAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(404).redirect('/login');
    }

    res.render('addressAdding', {
      fullname: user.fullname || 'User',
    });
  } catch (error) {
    console.error('Unable to get the add address page:', error.message);
    res.status(500).redirect('/page-404/');
  }
};

const addAddress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User not logged in' });
    }

    const { fullname, mobile, address, district, city, state, pincode, landmark, type } = req.body;

    if (!fullname || !mobile || !address || !district || !city || !state || !pincode) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided' });
    }

    const typeMap = {
      home: 'Home',
      work: 'Office',
      office: 'Office',
      other: 'Other',
    };
    const normalizedType = typeMap[type?.toLowerCase()] || 'Home';
    if (!['Home', 'Office', 'Other'].includes(normalizedType)) {
      return res.status(400).json({ success: false, message: 'Invalid address type' });
    }

  
    const existingAddresses = await Address.countDocuments({ userId });
    const isDefault = existingAddresses === 0;

    const newAddress = new Address({
      userId,
      fullname,
      mobile,
      address,
      district,
      city,
      state,
      pincode,
      landmark: landmark || '',
      type: normalizedType,
      isDefault,
    });

    await newAddress.save();

    res.status(201).json({
      success: true,
      message: 'User address created successfully',
      address: newAddress,
    });
  } catch (error) {
    console.error('Unable to add address:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to add address',
      error: error.message,
    });
  }
};

const geteditAddress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).redirect('/login');
    }

    const addressId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).redirect('/address');
    }

    const address = await Address.findOne({ _id: addressId, userId }).lean();
    if (!address) {
      return res.status(404).redirect('/address');
    }

    res.render('editAddress', { address });
  } catch (error) {
    console.error('Unable to get the user address edit page:', error.message);
    res.status(500).redirect('/page-404/');
  }
};



const updateAddress = async (req, res) => {
  try {
  
    const userId = req.session?.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    
    const addressId = req.params.id;
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing address ID' });
    }

    
    const { fullname, mobile, address, district, city, state, pincode, landmark, type } = req.body;

    
    const existingAddress = await Address.findOne({ _id: addressId, userId });
    if (!existingAddress) {
      return res.status(404).json({ success: false, message: 'Address not found or unauthorized' });
    }

  
    const typeMap = {
      home: 'Home',
      work: 'Office',
      office: 'Office',
      other: 'Other',
    };
    const normalizedType = typeMap[type?.toLowerCase()] || 'Home';


    const hasChanges =
      existingAddress.fullname !== fullname ||
      existingAddress.mobile !== mobile ||
      existingAddress.address !== address ||
      existingAddress.district !== district ||
      existingAddress.city !== city ||
      existingAddress.state !== state ||
      existingAddress.pincode !== pincode ||
      existingAddress.landmark !== (landmark || '') ||
      existingAddress.type !== normalizedType;

    if (!hasChanges) {
      return res.status(200).json({ success: false, message: 'No changes made' });
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
        landmark: landmark || '',
        type: normalizedType,
      },
      { new: true, runValidators: true }
    );

    if (!updatedAddress) {
      return res.status(404).json({ success: false, message: 'Address not found or unauthorized' });
    }

    return res.status(200).json({
      success: true,
      message: 'Your address has been updated successfully',
      address: updatedAddress,
    });
  } catch (error) {
    console.error('Update address error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the address. Please try again.',
      error: error.message,
    });
  }
};

module.exports = { updateAddress };
const removeAddress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User not logged in' });
    }

    const addressId = req.params.id;
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing address ID' });
    }

    const deletedAddress = await Address.findOneAndDelete({ _id: addressId, userId });

    if (!deletedAddress) {
      return res.status(404).json({ success: false, message: 'Address not found or unauthorized' });
    }

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
    });
  } catch (error) {
    console.error('Unable to delete address:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete address',
      error: error.message,
    });
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User not logged in' });
    }

    const addressId = req.params.id;
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing address ID' });
    }

    // Reset all addresses to non-default for the user
    await Address.updateMany({ userId }, { isDefault: false });

    // Set the selected address as default
    const updatedAddress = await Address.findOneAndUpdate(
      { _id: addressId, userId },
      { isDefault: true },
      { new: true }
    );

    if (!updatedAddress) {
      return res.status(404).json({ success: false, message: 'Address not found or unauthorized' });
    }

    res.status(200).json({
      success: true,
      message: 'Default address updated successfully',
    });
  } catch (error) {
    console.error('Unable to set default address:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to set default address',
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