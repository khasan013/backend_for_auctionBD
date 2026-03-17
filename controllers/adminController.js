const User = require('../models/User');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const Transaction = require('../models/Transaction');

// @route   GET /api/admin/dashboard
exports.getDashboard = async (req, res, next) => {
  try {
    const [
      totalUsers, totalAuctions, totalTransactions,
      activeAuctions, pendingPayments,
      recentUsers, recentAuctions,
    ] = await Promise.all([
      User.countDocuments(),
      Auction.countDocuments(),
      Transaction.countDocuments({ status: 'completed' }),
      Auction.countDocuments({ status: 'active' }),
      Transaction.countDocuments({ status: 'pending' }),
      User.find().sort('-createdAt').limit(5).select('name email createdAt isVerified role'),
      Auction.find({ status: 'active' }).sort('-createdAt').limit(5)
        .populate('seller', 'name').select('title currentPrice totalBids endTime'),
    ]);

    const revenueData = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, totalRevenue: { $sum: '$platformFee' }, totalVolume: { $sum: '$amount' } } },
    ]);

    const monthlyRevenue = await Transaction.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          revenue: { $sum: '$platformFee' },
          volume: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const categoryBreakdown = await Auction.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, totalValue: { $sum: '$currentPrice' } } },
      { $sort: { count: -1 } },
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers, totalAuctions, totalTransactions,
        activeAuctions, pendingPayments,
        totalRevenue: revenueData[0]?.totalRevenue || 0,
        totalVolume: revenueData[0]?.totalVolume || 0,
      },
      recentUsers,
      recentAuctions,
      monthlyRevenue,
      categoryBreakdown,
    });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/admin/users
exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role, isBanned } = req.query;
    const query = {};
    if (search) query.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
    if (role) query.role = role;
    if (isBanned !== undefined) query.isBanned = isBanned === 'true';

    const users = await User.find(query).sort('-createdAt').skip((page - 1) * limit).limit(Number(limit));
    const total = await User.countDocuments(query);
    res.json({ success: true, users, pagination: { page: Number(page), total } });
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/admin/users/:id/ban
exports.banUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id,
      { isBanned: true, banReason: req.body.reason }, { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User banned', user });
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/admin/users/:id/unban
exports.unbanUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id,
      { isBanned: false, banReason: undefined }, { new: true }
    );
    res.json({ success: true, message: 'User unbanned', user });
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/admin/users/:id/role
exports.updateUserRole = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true });
    res.json({ success: true, message: 'User role updated', user });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/admin/auctions
exports.getAuctions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) query.$text = { $search: search };

    const auctions = await Auction.find(query)
      .populate('seller', 'name email')
      .sort('-createdAt').skip((page - 1) * limit).limit(Number(limit));
    const total = await Auction.countDocuments(query);
    res.json({ success: true, auctions, pagination: { page: Number(page), total } });
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/admin/auctions/:id/feature
exports.toggleFeatured = async (req, res, next) => {
  try {
    const auction = await Auction.findById(req.params.id);
    if (!auction) return res.status(404).json({ success: false, message: 'Auction not found' });
    await Auction.findByIdAndUpdate(req.params.id, { isFeatured: !auction.isFeatured });
    res.json({ success: true, message: `Auction ${auction.isFeatured ? 'unfeatured' : 'featured'}` });
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/admin/auctions/:id/cancel
exports.cancelAuction = async (req, res, next) => {
  try {
    const auction = await Auction.findByIdAndUpdate(req.params.id,
      { status: 'cancelled', adminNotes: req.body.reason }, { new: true }
    );
    res.json({ success: true, message: 'Auction cancelled', auction });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/admin/transactions
exports.getTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = status ? { status } : {};
    const transactions = await Transaction.find(query)
      .populate('auction', 'title').populate('buyer', 'name email').populate('seller', 'name email')
      .sort('-createdAt').skip((page - 1) * limit).limit(Number(limit));
    const total = await Transaction.countDocuments(query);
    res.json({ success: true, transactions, pagination: { page: Number(page), total } });
  } catch (err) {
    next(err);
  }
};
