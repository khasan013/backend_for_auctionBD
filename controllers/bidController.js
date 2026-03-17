const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getIO } = require('../services/socketService');
const { createNotification } = require('../services/notificationService');
const logger = require('../config/logger');

// @route   POST /api/bids/:auctionId
exports.placeBid = async (req, res, next) => {
  try {
    const { amount, maxAutoBid } = req.body;
    const auctionId = req.params.auctionId;

    const auction = await Auction.findById(auctionId).populate('seller', '_id name');
    if (!auction) return res.status(404).json({ success: false, message: 'Auction not found' });

    // Validations
    if (auction.status !== 'active') {
      return res.status(400).json({ success: false, message: 'This auction is not active' });
    }
    if (new Date() > auction.endTime) {
      return res.status(400).json({ success: false, message: 'This auction has ended' });
    }
    if (auction.seller._id.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot bid on your own auction' });
    }

    const minBid = auction.currentPrice + auction.minimumBidIncrement;
    if (amount < minBid) {
      return res.status(400).json({
        success: false,
        message: `Minimum bid is $${minBid.toFixed(2)}`,
      });
    }

    // Mark previous bids as outbid
    await Bid.updateMany(
      { auction: auctionId, isWinning: true },
      { isWinning: false, isOutbid: true, status: 'outbid' }
    );

    // Get the previously winning bidder for outbid notification
    const prevWinningBid = await Bid.findOne({ auction: auctionId, status: 'outbid' })
      .sort('-amount')
      .populate('bidder', '_id name email');

    // Create new bid
    const bid = await Bid.create({
      auction: auctionId,
      bidder: req.user.id,
      amount,
      maxAutoBid: maxAutoBid || null,
      isWinning: true,
      status: 'active',
      ipAddress: req.ip,
    });

    // Update auction
    const updateData = {
      currentPrice: amount,
      $inc: { totalBids: 1 },
    };

    // Auto-extend if bid placed within last N minutes
    if (auction.autoExtend.enabled) {
      const minutesLeft = (auction.endTime - new Date()) / (1000 * 60);
      if (minutesLeft <= auction.autoExtend.minutes) {
        updateData.endTime = new Date(auction.endTime.getTime() + auction.autoExtend.minutes * 60 * 1000);
        logger.info(`Auction ${auctionId} extended by ${auction.autoExtend.minutes} minutes`);
      }
    }

    const updatedAuction = await Auction.findByIdAndUpdate(auctionId, updateData, { new: true });

    await bid.populate('bidder', 'name avatar');

    // ── Real-time events via Socket.io ──────────────────────────
    const io = getIO();
    const bidEvent = {
      auctionId,
      bid: {
        _id: bid._id,
        amount: bid.amount,
        bidder: bid.bidder,
        createdAt: bid.createdAt,
        isWinning: true,
      },
      newCurrentPrice: amount,
      totalBids: updatedAuction.totalBids,
      endTime: updatedAuction.endTime,
    };

    io.to(`auction:${auctionId}`).emit('newBid', bidEvent);

    // Notify outbid user
    if (prevWinningBid && prevWinningBid.bidder._id.toString() !== req.user.id) {
      await createNotification({
        recipient: prevWinningBid.bidder._id,
        type: 'outbid',
        title: "You've been outbid!",
        message: `Someone placed a higher bid of $${amount} on "${auction.title}"`,
        auction: auctionId,
      });

      // Real-time notification to outbid user
      io.to(`user:${prevWinningBid.bidder._id}`).emit('outbid', {
        auctionId,
        auctionTitle: auction.title,
        newAmount: amount,
      });
    }

    // Notify seller of new bid
    await createNotification({
      recipient: auction.seller._id,
      type: 'new_bid_on_your_auction',
      title: 'New bid on your auction',
      message: `A bid of $${amount} was placed on "${auction.title}"`,
      auction: auctionId,
    });

    io.to(`user:${auction.seller._id}`).emit('newBidOnYourAuction', {
      auctionId,
      amount,
    });

    res.status(201).json({
      success: true,
      message: 'Bid placed successfully!',
      bid: bidEvent.bid,
      newCurrentPrice: amount,
    });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/bids/:auctionId
exports.getAuctionBids = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await Bid.countDocuments({ auction: req.params.auctionId });

    const bids = await Bid.find({ auction: req.params.auctionId })
      .populate('bidder', 'name avatar')
      .sort('-amount')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.json({
      success: true, bids,
      pagination: { page: Number(page), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/bids/my
exports.getMyBids = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { bidder: req.user.id };
    if (status) query.status = status;

    const bids = await Bid.find(query)
      .populate({
        path: 'auction',
        select: 'title images currentPrice endTime status',
        populate: { path: 'seller', select: 'name' },
      })
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Bid.countDocuments(query);
    res.json({
      success: true, bids,
      pagination: { page: Number(page), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};
