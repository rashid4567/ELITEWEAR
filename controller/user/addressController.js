const User = require("../../model/userSChema");
const Address = require("../../model/AddressScheema"); 


const address = async (req, res) => {
    try {
      
        const userAddresses = await Address.find({ userId }).lean();

        res.render("address", { addresses: userAddresses });
    } catch (error) {
        console.error("Unable to get address page:", error.message);
        res.status(500).redirect("/page-404/");
    }
};


const getaddAddress = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).redirect("/login");
        }

        res.render("addressAdding");
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
            type
        } = req.body;

        if (!fullname || !mobile || !address || !district || !city || !state || !pincode) {
            return res.status(400).json({ success: false, message: "All required fields must be provided" });
        }

        
        const validTypes = ["Home", "Office", "Other"];
        if (type && !validTypes.includes(type)) {
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
            type: type || "Home"
        });

       
        await newAddress.save();

        res.status(201).json({
            success: true,
            message: "User address created successfully",
            address: newAddress
        });
    } catch (error) {
        console.error("Unable to add address:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to add address",
            error: error.message
        });
    }
};

module.exports = {
    getaddAddress,
    address,
    addAddress,
};