const express = require("express");
const router = express.Router();
const { createContact } = require("../controllers/contactController");

// @route   POST api/contact
// @desc    Create a new contact message
// @access  Public
router.post("/", createContact);

module.exports = router;
