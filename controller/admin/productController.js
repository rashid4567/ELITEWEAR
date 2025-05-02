const Product = require("../../model/productScheema")
const Category = require("../../model/categoryScheema")
const path = require("path")
const fs = require("fs").promises
const mongoose = require("mongoose")
const sharp = require("sharp")
const { count } = require("console")
const { unlink } = require("fs")
const cloudinary = require("cloudinary").v2
const { calculateEffectiveDiscount, applyDiscountToVariant, calculateSalePrice } = require("../../utils/offerUtils")

// Define all functions consistently using the same pattern
const updateProductOffer = async (req, res) => {
  try {
    const { productId, productIds, offer, override = false } = req.body

    // Handle single product update
    if (productId) {
      const product = await Product.findById(productId).populate("categoryId")
      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" })
      }

      // Update product offer
      product.productOffer = Number(offer)

      // Calculate effective discount (comparing product and category offers)
      const categoryOffer = product.categoryId ? product.categoryId.offer || 0 : 0
      product.categoryOffer = categoryOffer

      const { discount: effectiveDiscount, source: discountSource } = calculateEffectiveDiscount(
        product.productOffer,
        categoryOffer,
      )
      product.effectiveDiscount = effectiveDiscount
      product.discountSource = discountSource

      // Calculate sale price based on effective discount
      const regularPrice =
        product.regularPrice || (product.variants && product.variants.length > 0 ? product.variants[0].varientPrice : 0)
      product.salePrice = calculateSalePrice(regularPrice, effectiveDiscount)

      await product.save()

      return res.status(200).json({
        success: true,
        productOffer: product.productOffer,
        categoryOffer: product.categoryOffer,
        effectiveDiscount: product.effectiveDiscount,
        discountSource: product.discountSource,
        salePrice: product.salePrice,
        message: "Product offer updated successfully",
      })
    }

    // Handle bulk update
    if (productIds && Array.isArray(productIds)) {
      const updatePromises = productIds.map(async (id) => {
        const product = await Product.findById(id).populate("categoryId")
        if (!product) return null

        // Only update if override is true or product doesn't have an offer
        if (override || !product.productOffer) {
          product.productOffer = Number(offer)

          // Calculate effective discount
          const categoryOffer = product.categoryId ? product.categoryId.offer || 0 : 0
          product.categoryOffer = categoryOffer

          const { discount: effectiveDiscount, source: discountSource } = calculateEffectiveDiscount(
            product.productOffer,
            categoryOffer,
          )
          product.effectiveDiscount = effectiveDiscount
          product.discountSource = discountSource

          // Calculate sale price based on effective discount
          const regularPrice =
            product.regularPrice ||
            (product.variants && product.variants.length > 0 ? product.variants[0].varientPrice : 0)
          product.salePrice = calculateSalePrice(regularPrice, effectiveDiscount)

          return product.save()
        }
        return product
      })

      await Promise.all(updatePromises)

      return res.status(200).json({
        success: true,
        message: `Offers updated for ${productIds.length} products`,
      })
    }

    return res.status(400).json({ success: false, message: "Invalid request parameters" })
  } catch (error) {
    console.error("Error updating product offer:", error)
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
}

// Add these new methods for bulk operations
const bulkUpdateStatus = async (req, res) => {
  try {
    const { productIds, isActive } = req.body

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, message: "No products specified" })
    }

    await Product.updateMany({ _id: { $in: productIds } }, { $set: { isActive: isActive } })

    return res.status(200).json({
      success: true,
      message: `${productIds.length} products have been ${isActive ? "listed" : "unlisted"}`,
    })
  } catch (error) {
    console.error("Error in bulk status update:", error)
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
}

const bulkDeleteProducts = async (req, res) => {
  try {
    const { productIds } = req.body

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, message: "No products specified" })
    }

    await Product.deleteMany({ _id: { $in: productIds } })

    return res.status(200).json({
      success: true,
      message: `${productIds.length} products have been deleted`,
    })
  } catch (error) {
    console.error("Error in bulk delete:", error)
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
}

// Get products with AJAX
const getProductsAjax = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 12
    const skip = (page - 1) * limit

    // Get filter parameters
    const search = req.query.search || ""
    const categoryFilter = req.query.category || ""
    const minPrice = req.query.minPrice || ""
    const maxPrice = req.query.maxPrice || ""
    const sort = req.query.sort || "latest"
    const stockFilter = req.query.stock || ""

    // Build query
    const query = {}

    if (search) {
      query.name = { $regex: search, $options: "i" }
    }

    if (categoryFilter) {
      const category = await Category.findOne({ name: categoryFilter })
      if (category) {
        query.categoryId = category._id
      }
    }

    if (minPrice && maxPrice) {
      query.salePrice = { $gte: Number(minPrice), $lte: Number(maxPrice) }
    } else if (minPrice) {
      query.salePrice = { $gte: Number(minPrice) }
    } else if (maxPrice) {
      query.salePrice = { $lte: Number(maxPrice) }
    }

    if (stockFilter === "in-stock") {
      query.varientquatity = { $gt: 0 }
    } else if (stockFilter === "low-stock") {
      query.varientquatity = { $gt: 0, $lte: 10 }
    } else if (stockFilter === "out-of-stock") {
      query.varientquatity = { $lte: 0 }
    }

    // Sort options
    let sortOption = {}
    if (sort === "asc") {
      sortOption = { salePrice: 1 }
    } else if (sort === "desc") {
      sortOption = { salePrice: -1 }
    } else if (sort === "name-asc") {
      sortOption = { name: 1 }
    } else if (sort === "name-desc") {
      sortOption = { name: -1 }
    } else {
      sortOption = { createdAt: -1 } // latest
    }

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(query)
    const totalPage = Math.ceil(totalProducts / limit)

    // Get products with category information
    const products = await Product.find(query).populate("categoryId").sort(sortOption).skip(skip).limit(limit).lean()

    // Get additional stats for the enhanced UI
    const activeProducts = await Product.countDocuments({ isActive: true })
    const lowStockProducts = await Product.countDocuments({ varientquatity: { $gt: 0, $lte: 10 } })
    const productsWithOffers = await Product.countDocuments({
      $or: [{ productOffer: { $gt: 0 } }, { categoryOffer: { $gt: 0 } }],
    })

    return res.json({
      success: true,
      products,
      pagination: {
        currentPage: page,
        totalPage,
        totalProducts,
      },
      stats: {
        activeProducts,
        lowStockProducts,
        productsWithOffers,
        totalProducts,
      },
    })
  } catch (error) {
    console.error("Error fetching products:", error)
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
}

// Modify the ProductManagement method to include additional data for the enhanced UI
const ProductManagement = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = 12
    const skip = (page - 1) * limit

    // Get filter parameters
    const search = req.query.search || ""
    const categoryFilter = req.query.category || ""
    const minPrice = req.query.minPrice || ""
    const maxPrice = req.query.maxPrice || ""
    const sort = req.query.sort || "latest"
    const stockFilter = req.query.stock || ""

    // Build query
    const query = {}

    if (search) {
      query.name = { $regex: search, $options: "i" }
    }

    if (categoryFilter) {
      const category = await Category.findOne({ name: categoryFilter })
      if (category) {
        query.categoryId = category._id
      }
    }

    if (minPrice && maxPrice) {
      query.salePrice = { $gte: Number(minPrice), $lte: Number(maxPrice) }
    } else if (minPrice) {
      query.salePrice = { $gte: Number(minPrice) }
    } else if (maxPrice) {
      query.salePrice = { $lte: Number(maxPrice) }
    }

    if (stockFilter === "in-stock") {
      query.varientquatity = { $gt: 0 }
    } else if (stockFilter === "low-stock") {
      query.varientquatity = { $gt: 0, $lte: 10 }
    } else if (stockFilter === "out-of-stock") {
      query.varientquatity = { $lte: 0 }
    }

    // Sort options
    let sortOption = {}
    if (sort === "asc") {
      sortOption = { salePrice: 1 }
    } else if (sort === "desc") {
      sortOption = { salePrice: -1 }
    } else if (sort === "name-asc") {
      sortOption = { name: 1 }
    } else if (sort === "name-desc") {
      sortOption = { name: -1 }
    } else {
      sortOption = { createdAt: -1 } // latest
    }

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(query)
    const totalPage = Math.ceil(totalProducts / limit)

    // Get products with category information
    const data = await Product.find(query).populate("categoryId").sort(sortOption).skip(skip).limit(limit)

    // Calculate and update sale prices for all products if needed
    for (const product of data) {
      if (!product.salePrice || product.salePrice === 0) {
        const regularPrice =
          product.regularPrice ||
          (product.variants && product.variants.length > 0 ? product.variants[0].varientPrice : 0)
        product.salePrice = calculateSalePrice(regularPrice, product.effectiveDiscount || 0)
        await product.save()
      }
    }

    // Get additional stats for the enhanced UI
    const activeProducts = await Product.countDocuments({ isActive: true })
    const lowStockProducts = await Product.countDocuments({ varientquatity: { $gt: 0, $lte: 10 } })
    const productsWithOffers = await Product.countDocuments({
      $or: [{ productOffer: { $gt: 0 } }, { categoryOffer: { $gt: 0 } }],
    })

    // Get all categories for filter dropdown
    const cat = await Category.find({})

    if (data.length === 0 && page > 1) {
      return res.redirect("/admin/productManagment?page=1")
    }

    res.render("prodectManagment", {
      data,
      cat,
      currentPage: page,
      totalPage,
      search,
      categoryFilter,
      minPrice,
      maxPrice,
      sort,
      message: data.length === 0 ? "No products found matching your criteria" : "",
      // Additional data for enhanced UI
      totalProducts,
      activeProducts,
      lowStockProducts,
      productsWithOffers,
    })
  } catch (error) {
    console.log(error)
    res.status(500).send("Internal Server Error")
  }
}

// Other controller functions remain the same...
const getaddproduct = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true })
    res.render("addproduct", { categories })
  } catch (error) {
    console.error("Error fetching add product page:", error)
    res.redirect("/pageerror")
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const addproduct = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error("No form data received")
      return res.status(400).render("addproduct", {
        error: "No form data received. Please try again.",
        categories: await Category.find({ isListed: true }),
      })
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
    } = req.body

    const requiredFields = ["productName", "productDescription", "productCategory", "color", "fabric"]
    const missingFields = requiredFields.filter((field) => !req.body[field])
    if (missingFields.length > 0) {
      console.error("Missing required fields:", missingFields)
      return res.status(400).render("addproduct", {
        error: `Missing required fields: ${missingFields.join(", ")}`,
        categories: await Category.find({ isListed: true }),
      })
    }

    const images = []
    const imageSet = new Set()

    if (req.files && req.files.mainImage && req.files.mainImage.length > 0) {
      const mainImagePath = req.files.mainImage[0].path
      images.push({
        url: mainImagePath,
        thumbnail: mainImagePath,
        isMain: true,
      })
      imageSet.add(mainImagePath)
    } else {
      return res.status(400).render("addproduct", {
        error: "Please upload a main product image",
        categories: await Category.find({ isListed: true }),
      })
    }

    for (let i = 1; i <= 3; i++) {
      const fieldName = `additionalImage${i}`
      if (req.files && req.files[fieldName] && req.files[fieldName].length > 0) {
        const additionalImagePath = req.files[fieldName][0].path
        if (!imageSet.has(additionalImagePath)) {
          images.push({
            url: additionalImagePath,
            thumbnail: additionalImagePath,
            isMain: false,
          })
          imageSet.add(additionalImagePath)
        }
      }
    }

    const categoryData = await Category.findOne({ name: productCategory })
    if (!categoryData) {
      return res.status(400).render("addproduct", {
        error: "Invalid category",
        categories: await Category.find({ isListed: true }),
      })
    }

    // Get the product and category offers
    const productOfferValue = Number.parseFloat(productOffer) || 0
    const categoryOfferValue = categoryData.offer || 0

    // Determine which offer is higher
    const { discount: effectiveDiscount, source: discountSource } = calculateEffectiveDiscount(
      productOfferValue,
      categoryOfferValue,
    )

    let parsedVariants = []
    if (variants) {
      if (Array.isArray(variants)) {
        parsedVariants = variants.map((variant) => {
          const originalPrice = Number.parseInt(variant.varientPrice) || 0
          return applyDiscountToVariant(
            {
              size: variant.size,
              varientPrice: originalPrice,
              varientquatity: Number.parseInt(variant.varientquatity) || 0,
            },
            effectiveDiscount,
          )
        })
      } else if (typeof variants === "object") {
        if (Object.keys(variants).some((key) => !isNaN(Number.parseInt(key)))) {
          for (const key in variants) {
            if (variants.hasOwnProperty(key)) {
              const variant = variants[key]
              const originalPrice = Number.parseInt(variant.varientPrice) || 0

              parsedVariants.push(
                applyDiscountToVariant(
                  {
                    size: variant.size,
                    varientPrice: originalPrice,
                    varientquatity: Number.parseInt(variant.varientquatity) || 0,
                  },
                  effectiveDiscount,
                ),
              )
            }
          }
        } else if (variants.size && variants.varientPrice && variants.varientquatity) {
          const originalPrice = Number.parseInt(variants.varientPrice) || 0

          parsedVariants.push(
            applyDiscountToVariant(
              {
                size: variants.size,
                varientPrice: originalPrice,
                varientquatity: Number.parseInt(variants.varientquatity) || 0,
              },
              effectiveDiscount,
            ),
          )
        }
      } else if (req.body["variants[0][size]"]) {
        let index = 0
        while (req.body[`variants[${index}][size]`]) {
          const originalPrice = Number.parseInt(req.body[`variants[${index}][varientPrice]`]) || 0

          parsedVariants.push(
            applyDiscountToVariant(
              {
                size: req.body[`variants[${index}][size]`],
                varientPrice: originalPrice,
                varientquatity: Number.parseInt(req.body[`variants[${index}][varientquatity]`]) || 0,
              },
              effectiveDiscount,
            ),
          )
          index++
        }
      }
    }

    if (parsedVariants.length === 0) {
      return res.status(400).render("addproduct", {
        error: "Please add at least one variant",
        categories: await Category.find({ isListed: true }),
      })
    }

    // Calculate the regular price from the first variant
    const regularPrice = parsedVariants[0].varientPrice || 0

    // Calculate the sale price based on effective discount
    const salePrice = calculateSalePrice(regularPrice, effectiveDiscount)

    const newProduct = new Product({
      name: productName,
      description: productDescription,
      categoryId: categoryData._id,
      brand: brand || undefined,
      productOffer: productOfferValue,
      categoryOffer: categoryOfferValue,
      effectiveDiscount: effectiveDiscount,
      discountSource: discountSource,
      regularPrice: regularPrice,
      salePrice: salePrice,
      images,
      variants: parsedVariants,
      sku: sku || undefined,
      fabric: fabric.trim(),
      color: color.trim(),
      tags: req.body.tags ? (Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags]) : [],
      ratings: { average: 0, count: 0 },
      isActive: true,
    })

    await newProduct.save()
    return res.redirect("/admin/productManagment")
  } catch (error) {
    console.error("Product Add Error:", error)
    return res.status(500).render("addproduct", {
      error: "Failed to add product: " + error.message,
      categories: await Category.find({ isListed: true }),
    })
  }
}

const geteditProduct = async (req, res) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.redirect("/admin/productManagment")
    }

    // Fetch the product with populated category information
    const product = await Product.findById(id).populate("categoryId")

    if (!product) {
      return res.redirect("/pageerror")
    }

    // Ensure product offer fields are properly set
    if (!product.productOffer && product.productOffer !== 0) {
      product.productOffer = 0
    }

    // Ensure category offer fields are properly set
    if (product.categoryId && !product.categoryOffer) {
      product.categoryOffer = product.categoryId.offer || 0
    }

    // Calculate effective discount
    const { discount, source } = calculateEffectiveDiscount(product.productOffer || 0, product.categoryOffer || 0)
    product.effectiveDiscount = discount
    product.discountSource = source

    // Calculate sale price
    const regularPrice =
      product.regularPrice || (product.variants && product.variants.length > 0 ? product.variants[0].varientPrice : 0)
    product.salePrice = calculateSalePrice(regularPrice, discount)

    // Save the updated product
    await product.save()

    const categories = await Category.find({ isListed: true })

    res.render("editProduct", {
      product: product,
      categories: categories,
      error: null,
    })
  } catch (error) {
    console.error("Error in product editing page:", error)
    res.redirect("/pageerror")
  }
}

const editProduct = async (req, res) => {
  try {
    const id = req.params.id
    const product = await Product.findById(id)
    if (!product) {
      return res.status(404).render("editProduct", {
        error: "Product not found",
        product: null,
        categories: await Category.find({ isListed: true }),
      })
    }

    // Log the request body for debugging
    console.log("Form data received:", req.body);

    const {
      productName,
      productDescription,
      productCategory,
      productOffer, // This is the field name from the form
      productPrice,
      color,
      fabric,
      sku,
      brand,
      removeImages,
    } = req.body

    // Find the category by name
    const categoryData = await Category.findOne({ name: productCategory })
    if (!categoryData) {
      return res.status(400).render("editProduct", {
        error: "Category not found",
        product: product,
        categories: await Category.find({ isListed: true }),
      })
    }

    // Get the product and category offers
    const productOfferValue = Number(productOffer) || 0
    const categoryOfferValue = categoryData.offer || 0

    // Determine effective discount and source
    let effectiveDiscount = 0
    let discountSource = "none"
    
    if (productOfferValue >= categoryOfferValue) {
      effectiveDiscount = productOfferValue
      discountSource = "product"
    } else if (categoryOfferValue > 0) {
      effectiveDiscount = categoryOfferValue
      discountSource = "category"
    }

    // Process images
    let images = product.images || []

    // Handle image removal
    if (removeImages) {
      const removeImagesArray = Array.isArray(removeImages) ? removeImages : [removeImages]
      
      for (const imageToRemove of removeImagesArray) {
        const imagePath = path.join("public/productImages", imageToRemove)
        
        // Check if the image exists before attempting to delete it
        if (fs.existsSync(imagePath)) {
          fs.unlink(imagePath, (err) => {
            if (err) {
              console.error("Error deleting image:", err)
            } else {
              console.log("Image deleted successfully:", imagePath)
            }
          })
        } else {
          console.warn("Image not found:", imagePath)
        }
      }
      
      // Filter out removed images
      images = images.filter(image => !removeImagesArray.includes(image.url))
    }

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      // Process main image
      const mainImageFile = req.files.find(file => file.fieldname === 'mainImage')
      if (mainImageFile) {
        // Remove old main image if exists
        const oldMainImage = images.find(img => img.isMain)
        if (oldMainImage) {
          const oldImageIndex = images.indexOf(oldMainImage)
          if (oldImageIndex !== -1) {
            images.splice(oldImageIndex, 1)
          }
        }
        
        // Add new main image
        images.push({
          url: mainImageFile.filename,
          thumbnail: mainImageFile.filename,
          isMain: true
        })
      }
      
      // Process additional images
      const additionalImageFiles = req.files.filter(file => file.fieldname.startsWith('additionalImage'))
      for (const file of additionalImageFiles) {
        images.push({
          url: file.filename,
          thumbnail: file.filename,
          isMain: false
        })
      }
    }

    // Process variants
    let variants = []
    if (req.body.variants) {
      // Handle variants whether they come as an array or object
      const variantsData = Array.isArray(req.body.variants) 
        ? req.body.variants 
        : Object.values(req.body.variants)
      
      for (const variant of variantsData) {
        // Calculate sale price for each variant based on effective discount
        const variantPrice = Number(variant.varientPrice) || 0
        const salePrice = variantPrice - (variantPrice * effectiveDiscount / 100)
        
        variants.push({
          size: variant.size,
          varientPrice: variantPrice,
          salePrice: salePrice,
          varientquatity: Number(variant.varientquatity) || 0
        })
      }
    }

    // Update product fields
    product.name = productName
    product.description = productDescription
    product.categoryId = categoryData._id
    product.offer = productOfferValue // IMPORTANT: Map form field 'productOffer' to schema field 'offer'
    product.effectiveDiscount = effectiveDiscount
    product.discountSource = discountSource
    product.color = color
    product.fabric = fabric
    product.sku = sku || undefined
    product.brand = brand || undefined
    product.images = images
    product.variants = variants

    // Log the product data before saving
    console.log("Product data before saving:", {
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      offer: product.offer,
      effectiveDiscount: product.effectiveDiscount,
      discountSource: product.discountSource,
      variants: product.variants.map(v => ({
        size: v.size,
        varientPrice: v.varientPrice,
        salePrice: v.salePrice,
        varientquatity: v.varientquatity
      }))
    });

    // Save the updated product
    await product.save()
    
    console.log("Product updated successfully:", product._id);
    
    res.redirect("/admin/productManagment")
  } catch (error) {
    console.error("Error updating product:", error)
    
    // Render the edit page with error message
    return res.status(500).render("editProduct", {
      error: `Failed to update product: ${error.message}`,
      product: await Product.findById(req.params.id).populate("categoryId"),
      categories: await Category.find({ isListed: true })
    })
  }
}

const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ status: false, message: "Invalid product ID format" })
    }

    const deletedProduct = await Product.findByIdAndDelete(productId)

    if (!deletedProduct) {
      return res.status(404).json({ status: false, message: "Product not found" })
    }

    return res.json({
      status: true,
      message: "Product deleted successfully",
      deletedProductId: productId,
    })
  } catch (error) {
    console.error("Error deleting product:", error)
    return res.status(500).json({
      status: false,
      message: "Failed to delete product",
      error: error.message,
    })
  }
}

const UnlistProduct = async (req, res) => {
  try {
    const id = req.params.id
    const result = await Product.updateOne({ _id: id }, { $set: { isActive: false } })
    if (result.modifiedCount === 0) {
      res.status(404).json({ message: "product not found" })
    } else {
      res.json({ success: true, isActive: false })
    }
  } catch (error) {
    console.error("The admin unable to block product", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

const listProduct = async (req, res) => {
  try {
    const id = req.params.id
    const result = await Product.updateOne({ _id: id }, { $set: { isActive: true } })
    if (result.modifiedCount === 0) {
      res.status(404).json({ message: "Product unable to found" })
    } else {
      res.json({ success: true, isActive: true })
    }
  } catch (error) {
    console.error("The admin can unable to list the product", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Export all functions in a single module.exports object
module.exports = {
  ProductManagement,
  getaddproduct,
  addproduct,
  geteditProduct,
  editProduct,
  deleteProduct,
  UnlistProduct,
  listProduct,
  updateProductOffer,
  bulkUpdateStatus,
  bulkDeleteProducts,
  getProductsAjax,
}
