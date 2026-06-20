const rateLimit = require("express-rate-limit");

/*
const registerRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 5, 
    message: {
      message: "Too many requests from this IP, please try again after an hour.",
    },
    standardHeaders: true,
    legacyHeaders: false, 
  }); */

const loginRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: {
    message: "Too many requests from this IP, please try again after an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginRateLimiter };
