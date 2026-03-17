const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  auction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    required: true,
  },
  bidder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: [true, 'Bid amount is required'],
    min: [0.01, 'Bid amount must be positive'],
  },
  // Auto-bid (proxy bidding): user sets max, system bids incrementally
  maxAutoBid: {
    type: Number,
    default: null,
  },
  isAutoBid: {
    type: Boolean,
    default: false,
  },
  isWinning: {
    type: Boolean,
    default: false,
  },
  isOutbid: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['active', 'outbid', 'won', 'cancelled'],
    default: 'active',
  },
  ipAddress: { type: String },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

bidSchema.index({ auction: 1, amount: -1 });
bidSchema.index({ bidder: 1, createdAt: -1 });
bidSchema.index({ auction: 1, bidder: 1 });
bidSchema.index({ isWinning: 1, auction: 1 });

module.exports = mongoose.model('Bid', bidSchema);
