const SubCategorySchema = require('../models/SubCategoryModel');

exports.addSubCategory = async (req, res) => {
    const {title, category} = req.body;

    try {
        if (!title || !category) {
            return res.status(400).json({message: 'Title and category are required.'});
        }

        const subCategory = await SubCategorySchema.findOneAndUpdate(
            {
                title: title.trim(),
                category: category.trim(),
                user: req.user.id,
            },
            {
                title: title.trim(),
                category: category.trim(),
                user: req.user.id,
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
            }
        );

        res.status(200).json({message: 'Sub-category added', data: subCategory});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getSubCategories = async (req, res) => {
    try {
        const {category} = req.query;

        if (!category) {
            return res.status(400).json({message: 'Category is required.'});
        }

        const subCategories = await SubCategorySchema.find({
            category,
            user: req.user.id,
        }).sort({createdAt: -1});

        res.status(200).json(subCategories);
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
