const WishlistItem = require('../models/WishlistModel');

exports.addWishlistItem = async (req, res) => {
  const {
    title,
    estimatedAmount,
    priority,
    category,
    targetDate,
    notes,
    isPurchased,
  } = req.body;

  try {
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'title is required.' });
    }

    const item = await WishlistItem.create({
      user: req.user.id,
      title: title.trim(),
      estimatedAmount,
      priority: priority || 'Medium',
      category: category || 'Other',
      targetDate,
      notes: notes || '',
      isPurchased: !!isPurchased,
    });

    res.status(200).json({ message: 'Wishlist item added', data: item });
  } catch (error) {
    console.error('addWishlistItem error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getWishlistItems = async (req, res) => {
  try {
    const items = await WishlistItem.find({ user: req.user.id })
      .sort({ createdAt: -1 });
    res.status(200).json({ data: items });
  } catch (error) {
    console.error('getWishlistItems error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.updateWishlistItem = async (req, res) => {
  const { id } = req.params;
  const allowed = [
    'title',
    'estimatedAmount',
    'priority',
    'category',
    'targetDate',
    'notes',
    'isPurchased',
  ];

  try {
    const item = await WishlistItem.findOne({ _id: id, user: req.user.id });
    if (!item) {
      return res.status(404).json({ message: 'Wishlist item not found' });
    }

    allowed.forEach((key) => {
      if (req.body[key] !== undefined) item[key] = req.body[key];
    });
    if (req.body.title !== undefined) item.title = (req.body.title || '').trim();

    await item.save();
    res.status(200).json({ message: 'Wishlist item updated', data: item });
  } catch (error) {
    console.error('updateWishlistItem error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.deleteWishlistItem = async (req, res) => {
  const { id } = req.params;
  try {
    const item = await WishlistItem.findOneAndDelete({
      _id: id,
      user: req.user.id,
    });
    if (!item) {
      return res.status(404).json({ message: 'Wishlist item not found' });
    }
    res.status(200).json({ message: 'Wishlist item deleted' });
  } catch (error) {
    console.error('deleteWishlistItem error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};
