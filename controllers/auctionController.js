const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const User = require('../models/User');
const { getIO } = require('../services/socketService');
const logger = require('../config/logger');

// @route   GET /api/auctions
exports.getAuctions = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 12, category, status = 'active',
      search, sort = '-createdAt', minPrice, maxPrice,
      condition, isFeatured,
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (condition) query.condition = condition;
    if (isFeatured === 'true') query.isFeatured = true;
    if (minPrice || maxPrice) {
      query.currentPrice = {};
      if (minPrice) query.currentPrice.$gte = Number(minPrice);
      if (maxPrice) query.currentPrice.$lte = Number(maxPrice);
    }
    if (search) {
      query.$text = { $search: search };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Auction.countDocuments(query);

    const auctions = await Auction.find(query)
      .populate('seller', 'name avatar sellerRating')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      auctions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/auctions/:id
exports.getAuction = async (req, res, next) => {
  try {
    const auction = await Auction.findById(req.params.id)
      .populate('seller', 'name avatar sellerRating totalSales createdAt')
      .populate('winner', 'name avatar')
      .populate({
        path: 'bids',
        options: { sort: { amount: -1 }, limit: 10 },
        populate: { path: 'bidder', select: 'name avatar' },
      });

    if (!auction) {
      return res.status(404).json({ success: false, message: 'Auction not found' });
    }

    // Increment view count (fire-and-forget)
    Auction.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec();

    // Check if user is watching
    let isWatching = false;
    let userBid = null;
    if (req.user) {
      const user = await User.findById(req.user.id);
      isWatching = user.watchlist.includes(auction._id);
      userBid = await Bid.findOne({ auction: auction._id, bidder: req.user.id }).sort('-amount');
    }

    res.json({ success: true, auction, isWatching, userBid });
  } catch (err) {
    next(err);
  }
};

// @route   POST /api/auctions
exports.createAuction = async (req, res, next) => {
  try {
    const auctionData = { ...req.body, seller: req.user.id };

    // Validate times
    const startTime = new Date(auctionData.startTime);
    const endTime = new Date(auctionData.endTime);
    if (endTime <= startTime) {
      return res.status(400).json({ success: false, message: 'End time must be after start time' });
    }
    if (startTime < new Date()) {
      auctionData.status = 'active';
    } else {
      auctionData.status = 'scheduled';
    }

    auctionData.currentPrice = auctionData.startingPrice;

    const auction = await Auction.create(auctionData);
    await auction.populate('seller', 'name avatar');

    res.status(201).json({ success: true, message: 'Auction created successfully', auction });
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/auctions/:id
exports.updateAuction = async (req, res, next) => {
  try {
    let auction = await Auction.findById(req.params.id);
    if (!auction) return res.status(404).json({ success: false, message: 'Auction not found' });

    // Only seller or admin can edit
    if (auction.seller.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Can't edit active auction with bids
    if (auction.status === 'active' && auction.totalBids > 0 && req.user.role !== 'admin') {
      return res.status(400).json({ success: false, message: 'Cannot edit auction with existing bids' });
    }

    auction = await Auction.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    }).populate('seller', 'name avatar');

    res.json({ success: true, message: 'Auction updated', auction });
  } catch (err) {
    next(err);
  }
};

// @route   DELETE /api/auctions/:id
exports.deleteAuction = async (req, res, next) => {
  try {
    const auction = await Auction.findById(req.params.id);
    if (!auction) return res.status(404).json({ success: false, message: 'Auction not found' });

    if (auction.seller.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (auction.status === 'active' && auction.totalBids > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete auction with bids' });
    }

    await Auction.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
    res.json({ success: true, message: 'Auction cancelled successfully' });
  } catch (err) {
    next(err);
  }
};

// @route   POST /api/auctions/:id/watch
exports.toggleWatch = async (req, res, next) => {
  try {
    const auction = await Auction.findById(req.params.id);
    if (!auction) return res.status(404).json({ success: false, message: 'Auction not found' });

    const user = await User.findById(req.user.id);
    const isWatching = user.watchlist.includes(auction._id);

    if (isWatching) {
      user.watchlist = user.watchlist.filter(id => id.toString() !== auction._id.toString());
      await Auction.findByIdAndUpdate(req.params.id, { $inc: { watchCount: -1 } });
    } else {
      user.watchlist.push(auction._id);
      await Auction.findByIdAndUpdate(req.params.id, { $inc: { watchCount: 1 } });
    }

    await user.save({ validateBeforeSave: false });
    res.json({ success: true, isWatching: !isWatching, message: isWatching ? 'Removed from watchlist' : 'Added to watchlist' });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/auctions/my/listings
exports.getMyListings = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { seller: req.user.id };
    if (status) query.status = status;

    const total = await Auction.countDocuments(query);
    const auctions = await Auction.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.json({
      success: true, auctions,
      pagination: { page: Number(page), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/auctions/categories/stats
exports.getCategoryStats = async (req, res, next) => {
  try {
    const stats = await Auction.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$currentPrice' } } },
      { $sort: { count: -1 } },
    ]);
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
};
