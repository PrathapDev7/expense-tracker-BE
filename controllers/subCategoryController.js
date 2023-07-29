const SubCategorySchema = require("../models/SubCategoryModel");

exports.addSubCategory = async (req, res) => {
    const {title, category}  = req.body;

    const subCategory = SubCategorySchema({
        title,
        category
    });

    try {
        await subCategory.save();
        res.status(200).json({message: 'Sub Category Added'})
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.getSubCategories = async (req, res) =>{
    try {
        const subCategories = await SubCategorySchema.find({category : req.query.category}).sort({createdAt: -1});
        res.status(200).json(subCategories)
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};
