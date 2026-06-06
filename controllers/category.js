const CategorySchema = require("../models/CategoryModel");
const IncomeSchema = require("../models/IncomeModel");
const ExpenseSchema = require("../models/ExpenseModel");


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

exports.getRecentCategories = async (req, res) => {
    try {
        const {type} = req.query;
        const Model = type === 'income' ? IncomeSchema : ExpenseSchema;
        const records = await Model.find({
            user: req.user.id,
            category: {$exists: true, $ne: ''},
        })
            .sort({createdAt: -1})
            .limit(50)
            .select('category')
            .lean();

        const seen = new Set();
        const categories = records.reduce((acc, record) => {
            const title = (record.category || '').trim();
            const key = title.toLowerCase();
            if (!title || seen.has(key)) return acc;
            seen.add(key);
            acc.push({title});
            return acc;
        }, []);

        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
