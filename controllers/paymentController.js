const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { createNotification } = require('../services/notificationService');
const { getIO } = require('../services/socketService');
const logger = require('../config/logger');

const PLATFORM_FEE_PERCENT = 0.05; // 5%

// @route   POST /api/payments/create-intent/:auctionId
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const auction = await Auction.findById(req.params.auctionId)
      .populate('seller', 'stripeAccountId name')
      .populate('winningBid');

    if (!auction) return res.status(404).json({ success: false, message: 'Auction not found' });
    if (auction.status !== 'ended' && auction.status !== 'sold') {
      return res.status(400).json({ success: false, message: 'Auction has not ended yet' });
    }
    if (!auction.winner || auction.winner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the auction winner can pay' });
    }
    if (auction.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Already paid' });
    }

    const winAmount = auction.currentPrice;
    const shippingCost = auction.shipping.isFree ? 0 : (auction.shipping.cost || 0);
    const totalAmount = winAmount + shippingCost;
    const platformFee = Math.round(winAmount * PLATFORM_FEE_PERCENT * 100);
    const totalInCents = Math.round(totalAmount * 100);

    // Get or create Stripe customer
    let user = await User.findById(req.user.id);
    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name });
      user.stripeCustomerId = customer.id;
      await user.save({ validateBeforeSave: false });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalInCents,
      currency: 'usd',
      customer: user.stripeCustomerId,
      metadata: {
        auctionId: auction._id.toString(),
        userId: req.user.id,
        sellerId: auction.seller._id.toString(),
      },
      application_fee_amount: platformFee,
      ...(auction.seller.stripeAccountId && {
        transfer_data: { destination: auction.seller.stripeAccountId },
      }),
    });

    // Create pending transaction
    const existingTx = await Transaction.findOne({ auction: auction._id });
    if (!existingTx) {
      await Transaction.create({
        auction: auction._id,
        buyer: req.user.id,
        seller: auction.seller._id,
        winningBid: auction.winningBid,
        amount: winAmount,
        platformFee: winAmount * PLATFORM_FEE_PERCENT,
        sellerPayout: winAmount * (1 - PLATFORM_FEE_PERCENT),
        shippingCost,
        totalCharged: totalAmount,
        stripePaymentIntentId: paymentIntent.id,
        status: 'pending',
      });
    }

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      amount: totalInCents,
      auction: {
        title: auction.title,
        winAmount,
        shippingCost,
        totalAmount,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @route   POST /api/payments/confirm/:auctionId
exports.confirmPayment = async (req, res, next) => {
  try {
    const { paymentIntentId, shippingAddress } = req.body;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ success: false, message: 'Payment not confirmed by Stripe' });
    }

    const auction = await Auction.findByIdAndUpdate(
      req.params.auctionId,
      { paymentStatus: 'paid', status: 'sold' },
      { new: true }
    );

    const transaction = await Transaction.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntentId },
      { status: 'completed', paidAt: new Date(), shippingAddress, stripeChargeId: paymentIntent.latest_charge },
      { new: true }
    );

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { totalPurchases: 1, totalSpent: auction.currentPrice },
    });
    await User.findByIdAndUpdate(auction.seller, {
      $inc: { totalSales: 1, totalEarnings: transaction.sellerPayout },
    });

    // Notifications
    await createNotification({
      recipient: req.user.id,
      type: 'payment_received',
      title: 'Payment successful!',
      message: `Your payment of $${transaction.totalCharged} for "${auction.title}" was received.`,
      auction: auction._id,
    });
    await createNotification({
      recipient: auction.seller,
      type: 'payment_received',
      title: 'Payment received for your auction',
      message: `Payment of $${transaction.sellerPayout.toFixed(2)} (after fees) for "${auction.title}" is on its way.`,
      auction: auction._id,
    });

    const io = getIO();
    io.to(`user:${req.user.id}`).emit('paymentSuccess', { auctionId: auction._id });

    res.json({ success: true, message: 'Payment confirmed!', transaction });
  } catch (err) {
    next(err);
  }
};

// @route   POST /api/payments/webhook
exports.stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`Stripe webhook error: ${err.message}`);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      logger.info(`PaymentIntent succeeded: ${event.data.object.id}`);
      break;
    case 'payment_intent.payment_failed':
      const failed = event.data.object;
      await Transaction.findOneAndUpdate(
        { stripePaymentIntentId: failed.id },
        { status: 'failed', failureReason: failed.last_payment_error?.message }
      );
      break;
    default:
      logger.debug(`Unhandled webhook event: ${event.type}`);
  }

  res.json({ received: true });
};

// @route   GET /api/payments/transactions
exports.getMyTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role = 'buyer' } = req.query;
    const query = role === 'seller' ? { seller: req.user.id } : { buyer: req.user.id };

    const transactions = await Transaction.find(query)
      .populate('auction', 'title images')
      .populate(role === 'seller' ? 'buyer' : 'seller', 'name avatar')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Transaction.countDocuments(query);
    res.json({ success: true, transactions, pagination: { page: Number(page), total } });
  } catch (err) {
    next(err);
  }
};
