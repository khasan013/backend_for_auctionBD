const express = require('express');
const router  = express.Router();
const { body } = require('express-validator');

const {
  getAuctions,
  getAuction,
  createAuction,
  updateAuction,
  deleteAuction,
  toggleWatch,
  getMyListings,
  getCategoryStats,
} = require('../controllers/auctionController');
const { protect, optionalAuth } = require('../middleware/auth');

const auctionValidation = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 120 }),
  body('description').trim().notEmpty().withMessage('Description is required').isLength({ max: 5000 }),
  body('category').notEmpty().withMessage('Category is required'),
  body('condition').notEmpty().withMessage('Condition is required'),
  body('startingPrice')
    .isFloat({ min: 0.01 }).withMessage('Starting price must be at least $0.01'),
  body('startTime').isISO8601().withMessage('Valid start time is required'),
  body('endTime')
    .isISO8601().withMessage('Valid end time is required')
    .custom((endTime, { req }) => {
      if (new Date(endTime) <= new Date(req.body.startTime)) {
        throw new Error('End time must be after start time');
      }
      return true;
    }),
  body('reservePrice').optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Reserve price must be a positive number'),
  body('buyNowPrice').optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Buy now price must be a positive number'),
];

// ─── Route order matters ────────────────────────────────────────
// Static paths before dynamic :id to avoid conflicts

// Public
router.get('/',                  optionalAuth, getAuctions);
router.get('/categories/stats',  getCategoryStats);

// Protected — must come before /:id
router.get('/my/listings',       protect, getMyListings);
router.post('/',                 protect, auctionValidation, createAuction);

// Public with optional auth (populates isWatching / userBid)
router.get('/:id',               optionalAuth, getAuction);

// Protected — specific auction actions
router.put('/:id',               protect, updateAuction);
router.delete('/:id',            protect, deleteAuction);
router.post('/:id/watch',        protect, toggleWatch);

module.exports = router;