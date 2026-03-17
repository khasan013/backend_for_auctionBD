const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  auction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    required: true,
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  winningBid: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bid',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  platformFee: {
    type: Number,
    required: true, // e.g. 5% of amount
  },
  sellerPayout: {
    type: Number,
    required: true, // amount - platformFee
  },
  shippingCost: {
    type: Number,
    default: 0,
  },
  totalCharged: {
    type: Number,
    required: true, // amount + shippingCost
  },
  currency: {
    type: String,
    default: 'usd',
  },

  // Stripe
  stripePaymentIntentId: { type: String, unique: true },
  stripeChargeId: { type: String },
  stripeTransferId: { type: String }, // for seller payout

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'disputed'],
    default: 'pending',
  },
  failureReason: { type: String },

  // Shipping info collected at checkout
  shippingAddress: {
    name: String,
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
  },

  paymentMethod: { type: String }, // last4, card brand, etc.
  paidAt: { type: Date },
  refundedAt: { type: Date },
  refundReason: { type: String },
}, {
  timestamps: true,
});

transactionSchema.index({ buyer: 1, createdAt: -1 });
transactionSchema.index({ seller: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ stripePaymentIntentId: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
