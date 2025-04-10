const Banner = require("../../model/BannerScheema");
const path = require("path");
const fs = require("fs");

const getbannerPage = async (req, res) => {
  try {
    const findBanner = await Banner.find({});
    res.render("banner", { data: findBanner });
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.redirect("/pageerror");
  }
};

const getaddBanner = async (req, res) => {
  try {
    res.render("addBanner");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const addBanner = async (req, res) => {
  try {
    const data = req.body;
    const imageFile = req.file;
    if (!imageFile) {
      throw new Error("Image upload failed");
    }
    const newBanner = new Banner({
      image: imageFile.path,
      title: data.title,
      startingDate: new Date(data.startingDate + "T00:00:00"),
      endingDate: new Date(data.endingDate + "T00:00:00"),
      link: data.link,
      status: data.status,
    });
    await newBanner.save().then((data) => console.log(data));
    res.redirect("/banner");
  } catch (error) {
    console.error("Error saving banner:", error);
    res.redirect("/pageerror");
  }
};

const deleteBanner = async (req, res) => {
  try {
    const id = req.query.id;
    const deleteBanner = await Banner.deleteOne({ _id: id }).then((data) =>
      console.log(data)
    );
    if (!deleteBanner) {
      res.status(404).status({ message: "Banner not found" });
    } else {
      res.redirect("/banner");
    }
  } catch (error) {
    console.error("error on delting the banner, try again", error);
    res.redirect("/pageerror");
  }
};

module.exports = {
  getbannerPage,
  getaddBanner,
  addBanner,
  deleteBanner,
};
