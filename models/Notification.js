const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'outbid', 'auction_won', 'auction_ended', 'payment_received',
      'payment_required', 'auction_starting', 'watchlist_ending',
      'bid_placed', 'new_bid_on_your_auction', 'item_shipped',
      'item_received', 'account_verified', 'admin_message'
    ],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  auction: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction' },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
}, {
  timestamps: true,
});

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
