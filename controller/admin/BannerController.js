const Banner = require("../../model/BannerScheema");
const { uploadBase64Image, deleteImage, getPublicIdFromUrl } = require("../../middleware/cloudinaryBannerConfig");
const { processBase64BannerImage } = require("../../middleware/bannerImageProcessor");


const getbannerPage = async (req, res) => {
  try {
    const findBanner = await Banner.find({}).sort({ createdAt: -1 });
    res.render("banner", { data: findBanner });
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.redirect("/admin/error-404");
  }
};


const getaddBanner = async (req, res) => {
  try {
    res.render("addBanner");
  } catch (error) {
    console.error("Error rendering add banner page:", error);
    res.redirect("/admin/error-404");
  }
};

const addBanner = async (req, res) => {
  try {
    const data = req.body;
    let imageUrl;

    console.log("Add Banner Request received");
    console.log("Request body keys:", Object.keys(req.body));
    console.log("Content-Type:", req.get("Content-Type"));
    console.log("Form fields received:", {
      title: data.title,
      startingDate: data.startingDate,
      endingDate: data.endingDate,
      link: data.link,
      hasImageData: !!data.croppedImageData,
      imageDataLength: data.croppedImageData ? data.croppedImageData.length : 0,
    });

    
    if (data.croppedImageData && data.croppedImageData.startsWith("data:image")) {
      console.log("Cropped image data found, processing and uploading to Cloudinary...");

      try {
 
        const processedImageData = await processBase64BannerImage(data.croppedImageData);
        
       
        const uploadResult = await uploadBase64Image(processedImageData);
        imageUrl = uploadResult.secure_url;
        console.log("Image uploaded successfully:", imageUrl);
      } catch (uploadError) {
        console.error("Image processing or upload error:", uploadError);
        return res.status(500).json({
          success: false,
          error: `Image upload failed: ${uploadError.message}`,
        });
      }
    } else {
      console.error("No valid image data found in request");
      console.error("Received data keys:", Object.keys(data));
      return res.status(400).json({
        success: false,
        error: "No valid image data provided. Please select and crop an image.",
      });
    }

   
    const newBanner = new Banner({
      image: imageUrl,
      title: data.title,
      startingDate: new Date(data.startingDate + "T00:00:00"),
      endingDate: new Date(data.endingDate + "T00:00:00"),
      link: data.link || "#",
      status: determineStatus(new Date(data.startingDate), new Date(data.endingDate)),
    });

    console.log("Saving banner to database:", {
      title: newBanner.title,
      image: imageUrl ? "Image URL present" : "No image URL",
      startingDate: newBanner.startingDate,
      endingDate: newBanner.endingDate,
    });

    await newBanner.save();
    console.log("Banner saved successfully");


    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res.status(200).json({
        success: true,
        message: "Banner added successfully",
        redirect: "/admin/banner",
      });
    } else {
      req.flash("success", "Banner added successfully");
      return res.redirect("/admin/banner");
    }
  } catch (error) {
    console.error("Error saving banner:", error);

 
    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res.status(500).json({
        success: false,
        error: `Failed to add banner: ${error.message}`,
      });
    } else {
      req.flash("error", "Failed to add banner: " + error.message);
      return res.redirect("/admin/addBanner");
    }
  }
};

const getEditBanner = async (req, res) => {
  try {
    const id = req.query.id;
    const banner = await Banner.findById(id);

    if (!banner) {
      req.flash("error", "Banner not found");
      return res.redirect("/admin/banner");
    }

    res.render("editBanner", { banner });
  } catch (error) {
    console.error("Error fetching banner for edit:", error);
    req.flash("error", "Failed to load banner for editing");
    res.redirect("/admin/banner");
  }
};


const updateBanner = async (req, res) => {
  try {
    const id = req.query.id;
    const data = req.body;
    const banner = await Banner.findById(id);

    if (!banner) {
      req.flash("error", "Banner not found");
      return res.redirect("/admin/banner");
    }

    console.log("Update Banner Request received for ID:", id);
    console.log("Request body keys:", Object.keys(req.body));
    console.log("Form fields received:", {
      title: data.title,
      startingDate: data.startingDate,
      endingDate: data.endingDate,
      link: data.link,
      imageChanged: data.imageChanged,
      hasImageData: !!data.croppedImageData,
      imageDataLength: data.croppedImageData ? data.croppedImageData.length : 0,
    });

  
    banner.title = data.title;
    banner.startingDate = new Date(data.startingDate + "T00:00:00");
    banner.endingDate = new Date(data.endingDate + "T00:00:00");
    banner.link = data.link || "#";
    banner.status = determineStatus(banner.startingDate, banner.endingDate);

  
    if (data.imageChanged === "true" && data.croppedImageData && data.croppedImageData.startsWith("data:image")) {
      console.log("Image changed, processing and uploading new image to Cloudinary...");

   
      const publicId = getPublicIdFromUrl(banner.image);
      console.log("Current image public ID:", publicId);

      try {
        
        const processedImageData = await processBase64BannerImage(data.croppedImageData);
        
        let uploadResult;
        if (publicId) {

          uploadResult = await uploadBase64Image(processedImageData, publicId);
        } else {
    
          uploadResult = await uploadBase64Image(processedImageData);
        }

        banner.image = uploadResult.secure_url;
        console.log("New image uploaded successfully:", banner.image);
      } catch (uploadError) {
        console.error("Image processing or upload error:", uploadError);
        return res.status(500).json({
          success: false,
          error: `Image upload failed: ${uploadError.message}`,
        });
      }
    }

    await banner.save();
    console.log("Banner updated successfully");


    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res.status(200).json({
        success: true,
        message: "Banner updated successfully",
        redirect: "/admin/banner",
      });
    } else {
      req.flash("success", "Banner updated successfully");
      return res.redirect("/admin/banner");
    }
  } catch (error) {
    console.error("Error updating banner:", error);


    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res.status(500).json({
        success: false,
        error: `Failed to update banner: ${error.message}`,
      });
    } else {
      req.flash("error", "Failed to update banner: " + error.message);
      return res.redirect(`/admin/editBanner?id=${req.query.id}`);
    }
  }
};


const deleteBanner = async (req, res) => {
  try {
    const id = req.query.id;
    const banner = await Banner.findById(id);

    if (!banner) {
      req.flash("error", "Banner not found");
      return res.redirect("/admin/banner");
    }


    if (banner.image) {
      const publicId = getPublicIdFromUrl(banner.image);
      if (publicId) {
        await deleteImage(publicId);
      }
    }

    await Banner.deleteOne({ _id: id });
    req.flash("success", "Banner deleted successfully");
    res.redirect("/admin/banner");
  } catch (error) {
    console.error("Error deleting the banner:", error);
    req.flash("error", "Failed to delete banner: " + error.message);
    res.redirect("/admin/banner");
  }
};


const getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: banners });
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


const getBannerById = async (req, res) => {
  try {
    const id = req.params.id;
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    res.json({ success: true, data: banner });
  } catch (error) {
    console.error("Error fetching banner:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


const toggleBannerStatus = async (req, res) => {
  try {
    const id = req.params.id;
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    const today = new Date();

   
    if (banner.endingDate > today) {
   
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      banner.endingDate = yesterday;
      banner.status = "Expired";
    } else {
      
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(today.getDate() + 30);

      banner.startingDate = today;
      banner.endingDate = thirtyDaysLater;
      banner.status = "Active";
    }

    await banner.save();
    res.json({
      success: true,
      message: "Banner status updated successfully",
      data: banner,
    });
  } catch (error) {
    console.error("Error toggling banner status:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


function determineStatus(startDate, endDate) {
  const now = new Date();

  if (startDate > now) {
    return "Upcoming";
  } else if (endDate < now) {
    return "Expired";
  } else {
    return "Active";
  }
}

module.exports = {
  getbannerPage,
  getaddBanner,
  addBanner,
  deleteBanner,
  getEditBanner,
  updateBanner,
  getAllBanners,
  getBannerById,
  toggleBannerStatus,
};