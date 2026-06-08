const CategorySchema = require("../models/CategoryModel");
const IncomeSchema = require("../models/IncomeModel");
const ExpenseSchema = require("../models/ExpenseModel");
const SubCategorySchema = require("../models/SubCategoryModel");
const UserBudgetSchema = require("../models/UserBudgetModel");


exports.addCategory = async (req, res) => {
    const {title, type, icon, color}  = req.body;

    try {
        if (!title || !type) {
            return res.status(400).json({message: 'Title and type are required.'});
        }

        // Upsert so re-adding an existing/archived category is idempotent.
        const category = await CategorySchema.findOneAndUpdate(
            {user: req.user.id, title: title.trim(), type},
            {
                $set: {
                    title: title.trim(),
                    type,
                    user: req.user.id,
                    archived: false,
                    ...(icon !== undefined ? {icon} : {}),
                    ...(color !== undefined ? {color} : {}),
                },
            },
            {new: true, upsert: true, setDefaultsOnInsert: true}
        );

        res.status(200).json({message: 'Category Added', data: category})
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.getCategories = async (req, res) =>{
    try {
        const categories = await CategorySchema.find({
            user: req.user.id,
            type: req.query.type,
            archived: {$ne: true},
        }).sort({createdAt: -1});
        res.status(200).json(categories)
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.updateCategory = async (req, res) => {
    const {id} = req.params;
    const {title, icon, color} = req.body;

    try {
        const category = await CategorySchema.findOne({_id: id, user: req.user.id});
        if (!category) {
            return res.status(404).json({message: 'Category not found'});
        }

        const oldTitle = category.title;
        const newTitle = typeof title === 'string' && title.trim() ? title.trim() : oldTitle;

        // Guard against renaming onto an existing category of the same type.
        if (newTitle.toLowerCase() !== oldTitle.toLowerCase()) {
            const clash = await CategorySchema.findOne({
                _id: {$ne: category._id},
                user: req.user.id,
                type: category.type,
                title: newTitle,
            });
            if (clash) {
                return res.status(409).json({message: 'A category with that name already exists.'});
            }
        }

        category.title = newTitle;
        if (icon !== undefined) category.icon = icon;
        if (color !== undefined) category.color = color;
        await category.save();

        // Transactions, sub-categories and budgets reference categories by their
        // string title, so a rename must cascade to keep historical data linked.
        if (newTitle !== oldTitle) {
            await Promise.all([
                ExpenseSchema.updateMany({user: req.user.id, category: oldTitle}, {$set: {category: newTitle}}),
                IncomeSchema.updateMany({user: req.user.id, category: oldTitle}, {$set: {category: newTitle}}),
                SubCategorySchema.updateMany({user: req.user.id, category: oldTitle}, {$set: {category: newTitle}}),
            ]);

            const budgetDoc = await UserBudgetSchema.findOne({user: req.user.id});
            if (budgetDoc && budgetDoc.budgets &&
                Object.prototype.hasOwnProperty.call(budgetDoc.budgets, oldTitle)) {
                const next = {...budgetDoc.budgets};
                next[newTitle] = next[oldTitle];
                delete next[oldTitle];
                budgetDoc.budgets = next;
                budgetDoc.markModified('budgets');
                await budgetDoc.save();
            }
        }

        res.status(200).json({message: 'Category updated', data: category});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteCategory = async (req, res) => {
    const {id} = req.params;

    try {
        // Soft-delete: archive so it disappears from pickers while historical
        // transactions keep their label.
        const category = await CategorySchema.findOneAndUpdate(
            {_id: id, user: req.user.id},
            {$set: {archived: true}},
            {new: true}
        );

        if (!category) {
            return res.status(404).json({message: 'Category not found'});
        }

        res.status(200).json({message: 'Category deleted', data: category});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
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
