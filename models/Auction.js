const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Auction title is required'],
    trim: true,
    maxlength: [120, 'Title cannot exceed 120 characters'],
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters'],
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Electronics', 'Fashion', 'Collectibles', 'Art', 'Jewelry',
      'Vehicles', 'Home & Garden', 'Sports', 'Toys', 'Books',
      'Music', 'Gaming', 'Health & Beauty', 'Business', 'Other'
    ],
  },
  subcategory: { type: String },
  condition: {
    type: String,
    required: true,
    enum: ['New', 'Like New', 'Very Good', 'Good', 'Acceptable'],
  },
  images: [{
    url: { type: String, required: true },
    publicId: { type: String },
    isPrimary: { type: Boolean, default: false },
  }],

  // Pricing
  startingPrice: {
    type: Number,
    required: [true, 'Starting price is required'],
    min: [0.01, 'Starting price must be at least $0.01'],
  },
  reservePrice: {
    type: Number,
    default: null, // null means no reserve
  },
  buyNowPrice: {
    type: Number,
    default: null, // null means no buy now option
  },
  currentPrice: {
    type: Number,
    default: function () { return this.startingPrice; },
  },
  minimumBidIncrement: {
    type: Number,
    default: 1,
    min: 0.01,
  },

  // Timing
  startTime: {
    type: Date,
    required: [true, 'Start time is required'],
  },
  endTime: {
    type: Date,
    required: [true, 'End time is required'],
  },

  // Status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'ended', 'sold', 'cancelled', 'relisted'],
    default: 'draft',
  },

  // Participants
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  winningBid: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bid',
    default: null,
  },

  // Stats
  totalBids: { type: Number, default: 0 },
  watchCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },

  // Shipping
  shipping: {
    isFree: { type: Boolean, default: false },
    cost: { type: Number, default: 0 },
    methods: [{ type: String }],
    handlingTime: { type: Number, default: 3 }, // days
    location: { type: String },
    international: { type: Boolean, default: false },
  },

  // Payment
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  paymentIntentId: { type: String },

  // Moderation
  isApproved: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  adminNotes: { type: String },
  reports: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    createdAt: { type: Date, default: Date.now },
  }],

  // Auto-extend: if bid placed in last N minutes, extend by N minutes
  autoExtend: {
    enabled: { type: Boolean, default: true },
    minutes: { type: Number, default: 5 },
  },

  tags: [{ type: String, lowercase: true, trim: true }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for performance
auctionSchema.index({ status: 1, endTime: 1 });
auctionSchema.index({ seller: 1, status: 1 });
auctionSchema.index({ category: 1, status: 1 });
auctionSchema.index({ currentPrice: 1 });
auctionSchema.index({ isFeatured: 1, status: 1 });
auctionSchema.index({ endTime: 1 });
auctionSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Virtual: time remaining in ms
auctionSchema.virtual('timeRemaining').get(function () {
  if (this.status !== 'active') return 0;
  return Math.max(0, new Date(this.endTime) - new Date());
});

// Virtual: is reserve met
auctionSchema.virtual('isReserveMet').get(function () {
  if (!this.reservePrice) return true;
  return this.currentPrice >= this.reservePrice;
});

// Virtual: bids
auctionSchema.virtual('bids', {
  ref: 'Bid',
  localField: '_id',
  foreignField: 'auction',
});

module.exports = mongoose.model('Auction', auctionSchema);
