const Product = require("../../model/productScheema");
const Category = require("../../model/categoryScheema");
const path = require("path");
const fs = require("fs").promises;
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const {
  calculateEffectiveDiscount,
  applyDiscountToVariant,
  calculateSalePrice,
} = require("../../utils/offerUtils");

const getaddproduct = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true });
    res.render("addproduct", { categories });
  } catch (error) {
    console.error("Error fetching add product page:", error);
    res.redirect("/notfound");
  }
};

const addproduct = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error("No form data received");
      return res.status(400).render("addproduct", {
        error: "No form data received. Please try again.",
        categories: await Category.find({ isListed: true }),
      });
    }

    const {
      productName,
      productPrice,
      productDescription,
      productCategory,
      productOffer,
      variants,
      color,
      fabric,
      sku,
      brand,
      tags,
    } = req.body;

    const requiredFields = [
      { field: "productName", message: "Product name is required" },
      {
        field: "productDescription",
        message: "Product description is required",
      },
      { field: "productCategory", message: "Product category is required" },
      { field: "color", message: "Product color is required" },
      { field: "fabric", message: "Product fabric is required" },
      { field: "sku", message: "SKU is required" },
    ];

    for (const { field, message } of requiredFields) {
      if (
        !req.body[field] ||
        (typeof req.body[field] === "string" && !req.body[field].trim())
      ) {
        console.error(`Missing required field: ${field}`);
        return res.status(400).render("addproduct", {
          error: message,
          categories: await Category.find({ isListed: true }),
        });
      }
    }

    const numericFields = [
      {
        field: "productPrice",
        min: 100,
        max: 1000000,
        message: "Product price must be between ₹100 and ₹1,000,000",
      },
      {
        field: "productOffer",
        min: 0,
        max: 100,
        message: "Product offer must be between 0% and 100%",
      },
    ];

    for (const { field, min, max, message } of numericFields) {
      const value = Number.parseFloat(req.body[field]);
      if (isNaN(value) || value < min || value > max) {
        console.error(`Invalid ${field}: ${req.body[field]}`);
        return res.status(400).render("addproduct", {
          error: message,
          categories: await Category.find({ isListed: true }),
        });
      }
    }

    const skuRegex = /^[A-Za-z0-9-_]+$/;
    if (!skuRegex.test(sku)) {
      return res.status(400).render("addproduct", {
        error: "SKU can only contain letters, numbers, hyphens and underscores",
        categories: await Category.find({ isListed: true }),
      });
    }

    const existingSku = await Product.findOne({ sku });
    if (existingSku) {
      return res.status(400).render("addproduct", {
        error: "This SKU already exists. Please use a different one.",
        categories: await Category.find({ isListed: true }),
      });
    }

    const images = [];
    const imageSet = new Set();

    if (req.files && req.files.mainImage && req.files.mainImage.length > 0) {
      const mainImagePath = req.files.mainImage[0].path;

      const fileType = req.files.mainImage[0].mimetype;
      if (!fileType.startsWith("image/")) {
        return res.status(400).render("addproduct", {
          error: "Main image must be a valid image file",
          categories: await Category.find({ isListed: true }),
        });
      }

      const fileSize = req.files.mainImage[0].size;
      if (fileSize > 5 * 1024 * 1024) {
        return res.status(400).render("addproduct", {
          error: "Main image size must be less than 5MB",
          categories: await Category.find({ isListed: true }),
        });
      }

      images.push({
        url: mainImagePath,
        thumbnail: mainImagePath,
        isMain: true,
      });
      imageSet.add(mainImagePath);
    } else {
      return res.status(400).render("addproduct", {
        error: "Please upload a main product image",
        categories: await Category.find({ isListed: true }),
      });
    }

    for (let i = 1; i <= 3; i++) {
      const fieldName = `additionalImage${i}`;
      if (
        req.files &&
        req.files[fieldName] &&
        req.files[fieldName].length > 0
      ) {
        const additionalImagePath = req.files[fieldName][0].path;

        const fileType = req.files[fieldName][0].mimetype;
        if (!fileType.startsWith("image/")) {
          return res.status(400).render("addproduct", {
            error: `Additional image ${i} must be a valid image file`,
            categories: await Category.find({ isListed: true }),
          });
        }

        const fileSize = req.files[fieldName][0].size;
        if (fileSize > 5 * 1024 * 1024) {
          return res.status(400).render("addproduct", {
            error: `Additional image ${i} size must be less than 5MB`,
            categories: await Category.find({ isListed: true }),
          });
        }

        if (!imageSet.has(additionalImagePath)) {
          images.push({
            url: additionalImagePath,
            thumbnail: additionalImagePath,
            isMain: false,
          });
          imageSet.add(additionalImagePath);
        }
      }
    }

    const categoryData = await Category.findOne({ name: productCategory });
    if (!categoryData) {
      return res.status(400).render("addproduct", {
        error: "Invalid category",
        categories: await Category.find({ isListed: true }),
      });
    }

    const productOfferValue = Number(productOffer) || 0;
    const categoryOfferValue = Number(categoryData.offer) || 0;

    const { discount: effectiveDiscount, source: discountSource } =
      calculateEffectiveDiscount(productOfferValue, categoryOfferValue);

    let parsedVariants = [];

    if (!variants || (Array.isArray(variants) && variants.length === 0)) {
      return res.status(400).render("addproduct", {
        error: "Please add at least one variant",
        categories: await Category.find({ isListed: true }),
      });
    }

    if (variants) {
      if (Array.isArray(variants)) {
        parsedVariants = variants.map((variant) => {
          if (
            !variant.size ||
            !variant.varientPrice ||
            !variant.varientquatity
          ) {
            throw new Error("Each variant must have size, price, and quantity");
          }

          const originalPrice = Number(variant.varientPrice) || 0;
          if (originalPrice < 100 || originalPrice > 1000000) {
            throw new Error(
              `Variant price must be between ₹100 and ₹1,000,000 (${variant.size}: ${originalPrice})`
            );
          }

          const quantity = Number(variant.varientquatity) || 0;
          if (quantity <= 0) {
            throw new Error(
              `Variant quantity must be greater than 0 (${variant.size}: ${quantity})`
            );
          }

          return applyDiscountToVariant(
            {
              size: variant.size,
              varientPrice: originalPrice,
              varientquatity: quantity,
            },
            effectiveDiscount
          );
        });
      } else if (typeof variants === "object") {
        if (Object.keys(variants).some((key) => !isNaN(Number(key)))) {
          for (const key in variants) {
            if (variants.hasOwnProperty(key)) {
              const variant = variants[key];

              if (
                !variant.size ||
                !variant.varientPrice ||
                !variant.varientquatity
              ) {
                throw new Error(
                  "Each variant must have size, price, and quantity"
                );
              }

              const originalPrice = Number(variant.varientPrice) || 0;
              if (originalPrice < 100 || originalPrice > 1000000) {
                throw new Error(
                  `Variant price must be between ₹100 and ₹1,000,000 (${variant.size}: ${originalPrice})`
                );
              }

              const quantity = Number(variant.varientquatity) || 0;
              if (quantity <= 0) {
                throw new Error(
                  `Variant quantity must be greater than 0 (${variant.size}: ${quantity})`
                );
              }

              parsedVariants.push(
                applyDiscountToVariant(
                  {
                    size: variant.size,
                    varientPrice: originalPrice,
                    varientquatity: quantity,
                  },
                  effectiveDiscount
                )
              );
            }
          }
        } else if (
          variants.size &&
          variants.varientPrice &&
          variants.varientquatity
        ) {
          const originalPrice = Number(variants.varientPrice) || 0;
          if (originalPrice < 100 || originalPrice > 1000000) {
            throw new Error(
              `Variant price must be between ₹100 and ₹1,000,000 (${variants.size}: ${originalPrice})`
            );
          }

          const quantity = Number(variants.varientquatity) || 0;
          if (quantity <= 0) {
            throw new Error(
              `Variant quantity must be greater than 0 (${variants.size}: ${quantity})`
            );
          }

          parsedVariants.push(
            applyDiscountToVariant(
              {
                size: variants.size,
                varientPrice: originalPrice,
                varientquatity: quantity,
              },
              effectiveDiscount
            )
          );
        }
      } else if (req.body["variants[0][size]"]) {
        let index = 0;
        while (req.body[`variants[${index}][size]`]) {
          const size = req.body[`variants[${index}][size]`];
          const originalPrice =
            Number(req.body[`variants[${index}][varientPrice]`]) || 0;
          const quantity =
            Number(req.body[`variants[${index}][varientquatity]`]) || 0;

          if (originalPrice < 100 || originalPrice > 1000000) {
            throw new Error(
              `Variant price must be between ₹100 and ₹1,000,000 (${size}: ${originalPrice})`
            );
          }

          if (quantity <= 0) {
            throw new Error(
              `Variant quantity must be greater than 0 (${size}: ${quantity})`
            );
          }

          parsedVariants.push(
            applyDiscountToVariant(
              {
                size: size,
                varientPrice: originalPrice,
                varientquatity: quantity,
              },
              effectiveDiscount
            )
          );
          index++;
        }
      }
    }

    if (parsedVariants.length === 0) {
      return res.status(400).render("addproduct", {
        error: "Please add at least one variant",
        categories: await Category.find({ isListed: true }),
      });
    }

    const sizes = parsedVariants.map((v) => v.size);
    const uniqueSizes = new Set(sizes);
    if (sizes.length !== uniqueSizes.size) {
      return res.status(400).render("addproduct", {
        error: "Duplicate sizes are not allowed",
        categories: await Category.find({ isListed: true }),
      });
    }

    const regularPrice = parsedVariants[0].varientPrice || 0;

    const salePrice = calculateSalePrice(regularPrice, effectiveDiscount);

    const newProduct = new Product({
      name: productName.trim(),
      description: productDescription.trim(),
      categoryId: categoryData._id,
      brand: brand ? brand.trim() : undefined,
      offer: productOfferValue,
      categoryOffer: categoryOfferValue,
      effectiveDiscount: effectiveDiscount,
      discountSource: discountSource,
      regularPrice: regularPrice,
      salePrice: salePrice,
      images,
      variants: parsedVariants,
      sku: sku.trim(),
      fabric: fabric.trim(),
      color: color.trim(),
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      ratings: { average: 0, count: 0 },
      isActive: true,
    });

    await newProduct.save();

    req.session.successMessage = "Product added successfully";
    return res.redirect("/admin/productManagement");
  } catch (error) {
    console.error("Product Add Error:", error);
    return res.status(500).render("addproduct", {
      error: "Failed to add product: " + error.message,
      categories: await Category.find({ isListed: true }),
    });
  }
};

const geteditProduct = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.redirect("/admin/productManagement");
    }

    const product = await Product.findById(id).populate("categoryId");

    if (!product) {
      return res.redirect("/notfound");
    }

    if (!product.offer && product.offer !== 0) {
      product.offer = 0;
    }

    if (product.categoryId && !product.categoryOffer) {
      product.categoryOffer = product.categoryId.offer || 0;
    }

    const { discount, source } = calculateEffectiveDiscount(
      product.offer || 0,
      product.categoryOffer || 0
    );
    product.effectiveDiscount = discount;
    product.discountSource = source;

    const regularPrice =
      product.regularPrice ||
      (product.variants && product.variants.length > 0
        ? product.variants[0].varientPrice
        : 0);
    product.salePrice = calculateSalePrice(regularPrice, discount);

    await product.save();

    const categories = await Category.find({ isListed: true });

    res.render("editProduct", {
      product: product,
      categories: categories,
      error: null,
      success: req.session.successMessage || null,
    });

    if (req.session.successMessage) {
      delete req.session.successMessage;
    }
  } catch (error) {
    console.error("Error in product editing page:", error);
    res.redirect("/notfound");
  }
};

const getProductVariants = async (req, res) => {
  try {
    const productId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID format" });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    return res.json({
      success: true,
      variants: product.variants || [],
    });
  } catch (error) {
    console.error("Error fetching product variants:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const checkSkuExists = async (req, res) => {
  try {
    const { sku, productId } = req.query;

    const query = { sku };
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      query._id = { $ne: productId };
    }

    const existingProduct = await Product.findOne(query);
    res.json({ exists: !!existingProduct });
  } catch (error) {
    console.error("Error checking SKU:", error);
    res.status(500).json({ error: "Failed to check SKU" });
  }
};

const editProduct = async (req, res) => {
  try {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await Product.findById(id).populate("categoryId");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const {
      productName,
      productDescription,
      productCategory,
      productOffer,
      color,
      fabric,
      sku,
      brand,
      removeImages,
      removePublicIds,
      tags,
      imagePositions,
    } = req.body;

    const categoryData = await Category.findById(productCategory);
    if (!categoryData) {
      return res.status(400).json({
        success: false,
        message: "Category not found",
      });
    }

    product.name = productName;
    product.description = productDescription;
    product.categoryId = productCategory;
    product.offer = Number(productOffer) || 0;
    product.color = color;
    product.fabric = fabric;
    product.sku = sku;
    product.brand = brand;

    if (tags) {
      product.tags = Array.isArray(tags) ? tags : [tags];
    }

    const productOfferValue = Number(productOffer) || 0;
    const categoryOfferValue = categoryData.offer || 0;

    const { discount: effectiveDiscount, source: discountSource } =
      calculateEffectiveDiscount(productOfferValue, categoryOfferValue);

    product.effectiveDiscount = effectiveDiscount;
    product.discountSource = discountSource;

    let images = [...product.images] || [];

    if (removeImages && removeImages.length > 0) {
      const removeImagesArray = Array.isArray(removeImages)
        ? removeImages
        : [removeImages];

      if (removePublicIds && removePublicIds.length > 0) {
        const removePublicIdsArray = Array.isArray(removePublicIds)
          ? removePublicIds
          : [removePublicIds];

        for (const publicId of removePublicIdsArray) {
          if (publicId) {
            try {
              await cloudinary.uploader.destroy(publicId);
              console.log(`Deleted image with public_id: ${publicId}`);
            } catch (err) {
              console.error(
                `Failed to delete image with public_id: ${publicId}`,
                err
              );
            }
          }
        }
      }

      images = images.filter((image) => !removeImagesArray.includes(image.url));
    }

    if (req.files && Object.keys(req.files).length > 0) {
      const imageSlots = {
        mainImage: {
          index: images.findIndex((img) => img.isMain),
          isMain: true,
        },
        additionalImage1: { index: -1, isMain: false },
        additionalImage2: { index: -1, isMain: false },
        additionalImage3: { index: -1, isMain: false },
      };

      const nonMainImages = images.filter((img) => !img.isMain);
      for (let i = 0; i < Math.min(3, nonMainImages.length); i++) {
        const slotName = `additionalImage${i + 1}`;
        const originalIndex = images.findIndex(
          (img) => img === nonMainImages[i]
        );
        if (originalIndex !== -1) {
          imageSlots[slotName].index = originalIndex;
        }
      }

      for (const fieldName of Object.keys(req.files)) {
        if (req.files[fieldName] && req.files[fieldName].length > 0) {
          const imageFile = req.files[fieldName][0];
          const slot = imageSlots[fieldName];

          const imageResult = await cloudinary.uploader.upload(imageFile.path, {
            folder: "products",
            transformation: [{ width: 1000, height: 1000, crop: "limit" }],
          });

          const newImage = {
            url: imageResult.secure_url,
            thumbnail: imageResult.secure_url,
            isMain: slot.isMain,
            public_id: imageResult.public_id,
          };

          if (slot.index !== -1) {
            if (images[slot.index].public_id) {
              try {
                await cloudinary.uploader.destroy(images[slot.index].public_id);
                console.log(
                  `Replaced image with public_id: ${
                    images[slot.index].public_id
                  }`
                );
              } catch (err) {
                console.error(
                  `Failed to delete old image: ${images[slot.index].public_id}`,
                  err
                );
              }
            }

            images[slot.index] = newImage;
          } else {
            images.push(newImage);
          }
        }
      }
    }

    if (req.body.existingImages) {
      const existingImages = Array.isArray(req.body.existingImages)
        ? req.body.existingImages
        : [req.body.existingImages];

      for (let i = 0; i < existingImages.length; i++) {
        const imgData = existingImages[i];
        if (imgData && imgData.url) {
          const imageIndex = images.findIndex((img) => img.url === imgData.url);
          if (imageIndex !== -1) {
            images[imageIndex].isMain = imgData.isMain === "true";
          }
        }
      }
    }

    if (images.length > 0 && !images.some((img) => img.isMain)) {
      images[0].isMain = true;
    }

    product.images = images;

    const variants = [];
    if (req.body.variants) {
      let variantsData = [];

      if (Array.isArray(req.body.variants)) {
        variantsData = req.body.variants;
      } else if (typeof req.body.variants === "object") {
        Object.keys(req.body.variants).forEach((key) => {
          if (
            typeof req.body.variants[key] === "object" &&
            req.body.variants[key].size
          ) {
            variantsData.push(req.body.variants[key]);
          }
        });
      }

      for (const variant of variantsData) {
        const variantPrice = Number.parseFloat(variant.varientPrice);
        const variantQuantity = Number.parseInt(variant.varientquatity);

        const variantObj = applyDiscountToVariant(
          {
            size: variant.size,
            varientPrice: variantPrice,
            varientquatity: variantQuantity,
          },
          effectiveDiscount
        );

        if (variant._id) {
          variantObj._id = variant._id;
        }

        variants.push(variantObj);
      }
    }

    product.variants = variants.length > 0 ? variants : product.variants;

    if (product.variants && product.variants.length > 0) {
      product.variants = product.variants.map((variant) => {
        return applyDiscountToVariant(
          {
            ...variant,
            varientPrice: variant.varientPrice,
            varientquatity: variant.varientquatity,
          },
          effectiveDiscount
        );
      });
    }

    const regularPrice = product.variants[0]?.varientPrice || 0;
    product.regularPrice = regularPrice;
    product.salePrice = calculateSalePrice(regularPrice, effectiveDiscount);

    await product.save();

    req.session.successMessage = "Product updated successfully";

    const redirectUrl = req.query.redirect || `/admin/edit-product/${id}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product: " + error.message,
    });
  }
};

const ProductManagement = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const categoryFilter = req.query.category || "";
    const minPrice = req.query.minPrice || "";
    const maxPrice = req.query.maxPrice || "";
    const sort = req.query.sort || "latest";
    const stockFilter = req.query.stock || "";
    const viewMode = req.query.view || "grid";
    const bulkActionsVisible = req.query.bulkActions === "true";

    const query = {};

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    if (categoryFilter) {
      const category = await Category.findOne({ name: categoryFilter });
      if (category) {
        query.categoryId = category._id;
      }
    }

    if (minPrice && maxPrice) {
      query["variants.varientPrice"] = {
        $gte: Number(minPrice),
        $lte: Number(maxPrice),
      };
    } else if (minPrice) {
      query["variants.varientPrice"] = { $gte: Number(minPrice) };
    } else if (maxPrice) {
      query["variants.varientPrice"] = { $lte: Number(maxPrice) };
    }

    if (stockFilter === "in-stock") {
      query["variants.varientquatity"] = { $gt: 10 };
    } else if (stockFilter === "low-stock") {
      query["variants.varientquatity"] = { $gt: 0, $lte: 10 };
    } else if (stockFilter === "out-of-stock") {
      query["variants.varientquatity"] = { $lte: 0 };
    }

    let sortOption = {};
    if (sort === "asc") {
      sortOption = { "variants.varientPrice": 1 };
    } else if (sort === "desc") {
      sortOption = { "variants.varientPrice": -1 };
    } else if (sort === "name-asc") {
      sortOption = { name: 1 };
    } else if (sort === "name-desc") {
      sortOption = { name: -1 };
    } else {
      sortOption = { createdAt: -1 };
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(query)
      .populate("categoryId")
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    for (const product of products) {
      if (!product.effectiveDiscount && product.effectiveDiscount !== 0) {
        const categoryOffer = product.categoryId
          ? product.categoryId.offer || 0
          : 0;
        const { discount, source } = calculateEffectiveDiscount(
          product.offer || 0,
          categoryOffer
        );
        product.effectiveDiscount = discount;
        product.discountSource = source;

        if (product.variants && product.variants.length > 0) {
          product.variants = product.variants.map((variant) =>
            applyDiscountToVariant(variant, product.effectiveDiscount)
          );
        }

        await product.save();
      }
    }

    const activeProducts = await Product.countDocuments({ isActive: true });
    const lowStockProducts = await Product.countDocuments({
      "variants.varientquatity": { $gt: 0, $lte: 10 },
    });
    const productsWithOffers = await Product.countDocuments({
      $or: [{ offer: { $gt: 0 } }, { "categoryId.offer": { $gt: 0 } }],
    });

    const categories = await Category.find({});

    if (products.length === 0 && page > 1) {
      return res.redirect("/admin/productManagement?page=1");
    }

    const stats = {
      totalProducts,
      activeProducts,
      lowStockProducts,
      productsWithOffers,
    };

    const filters = {
      search,
      category: categoryFilter,
      minPrice,
      maxPrice,
      sort,
      stock: stockFilter,
    };

    const queryParams = new URLSearchParams();
    if (search) queryParams.append("search", search);
    if (categoryFilter) queryParams.append("category", categoryFilter);
    if (minPrice) queryParams.append("minPrice", minPrice);
    if (maxPrice) queryParams.append("maxPrice", maxPrice);
    if (sort) queryParams.append("sort", sort);
    if (stockFilter) queryParams.append("stock", stockFilter);
    if (viewMode) queryParams.append("view", viewMode);
    if (bulkActionsVisible) queryParams.append("bulkActions", "true");

    const paginationQueryString = queryParams.toString()
      ? `&${queryParams.toString()}`
      : "";

    res.render("prodectManagment", {
      products,
      categories,
      currentPage: page,
      totalPages,
      filters,
      paginationQueryString,
      message:
        products.length === 0 ? "No products found matching your criteria" : "",
      stats,
      viewMode,
      bulkActionsVisible,
      loading: false,
      success: req.session.successMessage || null,
    });

    if (req.session.successMessage) {
      delete req.session.successMessage;
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

const listProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const result = await Product.updateOne(
      { _id: id },
      { $set: { isActive: true } }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    return res.json({
      success: true,
      isActive: true,
      message: "Product listed successfully",
    });
  } catch (error) {
    console.error("Error listing product:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const UnlistProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const result = await Product.updateOne(
      { _id: id },
      { $set: { isActive: false } }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    return res.json({
      success: true,
      isActive: false,
      message: "Product unlisted successfully",
    });
  } catch (error) {
    console.error("Error unlisting product:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const bulkUpdateStatus = async (req, res) => {
  try {
    const { productIds, isActive } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No products specified" });
    }

    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      { $set: { isActive: isActive } }
    );

    return res.status(200).json({
      success: true,
      message: `${productIds.length} products have been ${
        isActive ? "listed" : "unlisted"
      }`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error in bulk status update:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const bulkDeleteProducts = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No products specified" });
    }

    const result = await Product.deleteMany({ _id: { $in: productIds } });

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} products have been deleted`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error in bulk delete:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const updateProductOffer = async (req, res) => {
  try {
    const { productId, productIds, offer, override = false } = req.body;

    if (productId) {
      const product = await Product.findById(productId).populate("categoryId");
      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found" });
      }

      product.offer = Number(offer);

      const categoryOffer = product.categoryId
        ? product.categoryId.offer || 0
        : 0;

      const { discount: effectiveDiscount, source: discountSource } =
        calculateEffectiveDiscount(product.offer, categoryOffer);

      product.effectiveDiscount = effectiveDiscount;
      product.discountSource = discountSource;

      if (product.variants && product.variants.length > 0) {
        product.variants = product.variants.map((variant) =>
          applyDiscountToVariant(variant, effectiveDiscount)
        );
      }

      await product.save();

      return res.status(200).json({
        success: true,
        offer: product.offer,
        categoryOffer,
        effectiveDiscount: product.effectiveDiscount,
        discountSource: product.discountSource,
        message: "Product offer updated successfully",
      });
    }

    if (productIds && Array.isArray(productIds)) {
      const updatePromises = productIds.map(async (id) => {
        const product = await Product.findById(id).populate("categoryId");
        if (!product) return null;

        if (override || !product.offer) {
          product.offer = Number(offer);

          const categoryOffer = product.categoryId
            ? product.categoryId.offer || 0
            : 0;

          const { discount: effectiveDiscount, source: discountSource } =
            calculateEffectiveDiscount(product.offer, categoryOffer);

          product.effectiveDiscount = effectiveDiscount;
          product.discountSource = discountSource;

          if (product.variants && product.variants.length > 0) {
            product.variants = product.variants.map((variant) =>
              applyDiscountToVariant(variant, effectiveDiscount)
            );
          }

          return product.save();
        }
        return product;
      });

      await Promise.all(updatePromises);

      return res.status(200).json({
        success: true,
        message: `Offers updated for ${productIds.length} products`,
      });
    }

    return res
      .status(400)
      .json({ success: false, message: "Invalid request parameters" });
  } catch (error) {
    console.error("Error updating product offer:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID format" });
    }

    const deletedProduct = await Product.findByIdAndDelete(productId);

    if (!deletedProduct) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    return res.json({
      success: true,
      message: "Product deleted successfully",
      deletedProductId: productId,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
      error: error.message,
    });
  }
};

module.exports = {
  getaddproduct,
  addproduct,
  checkSkuExists,
  ProductManagement,
  listProduct,
  UnlistProduct,
  bulkUpdateStatus,
  bulkDeleteProducts,
  updateProductOffer,
  geteditProduct,
  editProduct,
  deleteProduct,
  getProductVariants,
};
