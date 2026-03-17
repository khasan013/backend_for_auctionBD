const User = require('../models/User');
const Auction = require('../models/Auction');
const Notification = require('../models/Notification');
const { cloudinary } = require('../config/cloudinary');

// @route   PUT /api/users/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      phone: req.body.phone,
      bio: req.body.bio,
      address: req.body.address,
    };
    Object.keys(fieldsToUpdate).forEach(k => fieldsToUpdate[k] === undefined && delete fieldsToUpdate[k]);

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, { new: true, runValidators: true });
    res.json({ success: true, message: 'Profile updated', user });
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/users/avatar
exports.updateAvatar = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });

    const user = await User.findById(req.user.id);
    if (user.avatar.publicId) {
      await cloudinary.uploader.destroy(user.avatar.publicId);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: { url: req.file.path, publicId: req.file.filename } },
      { new: true }
    );

    res.json({ success: true, message: 'Avatar updated', avatar: updatedUser.avatar });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/users/:id/profile
exports.getPublicProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name avatar bio sellerRating totalSales totalRatings createdAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const activeAuctions = await Auction.find({ seller: req.params.id, status: 'active' })
      .select('title images currentPrice endTime totalBids').limit(8);

    res.json({ success: true, user, activeAuctions });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/users/notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const query = { recipient: req.user.id };
    if (unreadOnly === 'true') query.isRead = false;

    const notifications = await Notification.find(query)
      .populate('auction', 'title images')
      .sort('-createdAt').skip((page - 1) * limit).limit(Number(limit));

    const unreadCount = await Notification.countDocuments({ recipient: req.user.id, isRead: false });
    const total = await Notification.countDocuments(query);

    res.json({ success: true, notifications, unreadCount, pagination: { page: Number(page), total } });
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/users/notifications/read
exports.markNotificationsRead = async (req, res, next) => {
  try {
    const { notificationIds } = req.body;
    const query = { recipient: req.user.id };
    if (notificationIds?.length) query._id = { $in: notificationIds };

    await Notification.updateMany(query, { isRead: true, readAt: new Date() });
    res.json({ success: true, message: 'Notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

// @route   GET /api/users/watchlist
exports.getWatchlist = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'watchlist',
        populate: { path: 'seller', select: 'name avatar' },
        options: { sort: { endTime: 1 } },
      });
    res.json({ success: true, watchlist: user.watchlist });
  } catch (err) {
    next(err);
  }
};
