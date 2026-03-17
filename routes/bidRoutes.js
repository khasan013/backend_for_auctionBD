const express = require('express');
const router  = express.Router();
const { body } = require('express-validator');

const {
  placeBid,
  getAuctionBids,
  getMyBids,
} = require('../controllers/bidController');
const { protect } = require('../middleware/auth');

const bidValidation = [
  body('amount')
    .isFloat({ min: 0.01 }).withMessage('Bid amount must be greater than $0.00'),
  body('maxAutoBid').optional({ nullable: true })
    .isFloat({ min: 0.01 }).withMessage('Max auto-bid must be greater than $0.00')
    .custom((maxAutoBid, { req }) => {
      if (maxAutoBid && parseFloat(maxAutoBid) < parseFloat(req.body.amount)) {
        throw new Error('Max auto-bid must be ≥ your bid amount');
      }
      return true;
    }),
];

// ─── Route order matters ────────────────────────────────────────
// /user/my must come before /:auctionId — otherwise "user" is
// treated as an auctionId param

router.get('/user/my',       protect, getMyBids);
router.get('/:auctionId',            getAuctionBids);
router.post('/:auctionId',   protect, bidValidation, placeBid);

module.exports = router;