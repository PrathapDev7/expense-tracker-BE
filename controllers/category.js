const CategorySchema = require("../models/CategoryModel");


exports.addCategory = async (req, res) => {
    const {title, type}  = req.body;

    const category = CategorySchema({
        title,
        type
    });

    try {
        await category.save();
        res.status(200).json({message: 'Category Added'})
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.getCategories = async (req, res) =>{
    try {
        const categories = await CategorySchema.find({type : req.query.type}).sort({createdAt: -1});
        res.status(200).json(categories)
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};