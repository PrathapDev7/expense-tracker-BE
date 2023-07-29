const IncomeSchema= require("../models/IncomeModel");
const moment = require('moment');

exports.addIncome = async (req, res) => {
    const {title, amount, category, description, date}  = req.body;
    const income = IncomeSchema({
        title,
        amount,
        category,
        description,
        date,
        user: req.user.id,
    });

    try {
        //validations
        if(!title || !category || !date){
            return res.status(400).json({message: 'All fields are required!'})
        }
        if(amount <= 0 || !amount === 'number'){
            return res.status(400).json({message: 'Amount must be a positive number!'})
        }
        await income.save();
        res.status(200).json({message: 'Income Added'})
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.updateIncome = async (req, res) => {
    const { title, amount, category, description, date } = req.body;
    const incomeId = req.params.id; // Assuming the income ID is passed as a route parameter

    try {
        // Check if the income record exists in the database
        const income = await IncomeSchema.findById(incomeId);
        if (!income) {
            return res.status(404).json({ message: 'Income record not found' });
        }

        // Perform validations on the updated data (similar to the addIncome function)
        if (!title || !category || !date) {
            return res.status(400).json({ message: 'All fields are required!' });
        }

        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ message: 'Amount must be a positive number!' });
        }

        // Update the income record with the new data
        income.title = title;
        income.amount = amount;
        income.category = category;
        income.description = description;
        income.date = date;

        // Save the updated income record to the database
        await income.save();

        res.status(200).json({ message: 'Income updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};


exports.getIncomes = async (req, res) =>{
    try {

        const { start_date, end_date, keyword } = req.query;
        const query = { user: req.user.id };

        if (!start_date && !end_date) {
            const currentDate = moment().format('YYYY-MM-DD');
            query.date = { $eq: currentDate };
        } else {
            query.date = { $gte: start_date , $lte: end_date};
        }

        if (keyword) {
            const keywordRegExp = new RegExp(keyword, 'i');
            const parsedAmount = parseFloat(keyword);
            if (!isNaN(parsedAmount)) {
                query.amount = parsedAmount;
            } else {
                query.$or = [
                    { description: keywordRegExp },
                    { category: keywordRegExp },
                    { title: keywordRegExp },
                ];
            }
        }

        const incomes = await IncomeSchema.find(query).sort({createdAt: -1});
        res.status(200).json(incomes)
    } catch (error) {
        res.status(500).json({message: 'Server Error'})
    }
};

exports.deleteIncome = async (req, res) =>{
    const {id} = req.params;
    IncomeSchema.findByIdAndDelete(id)
        .then((income) =>{
            res.status(200).json({message: 'Income Deleted'})
        })
        .catch((err) =>{
            res.status(500).json({message: 'Server Error'})
        })
}
