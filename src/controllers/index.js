const userControllers = require("./user.controller");
const kaderControllers = require("./kader.controller");
const ibuControllers = require("./ibu.controller");
const gptControllers = require("./gpt.controller");

module.exports = {
  ...userControllers,
  ...kaderControllers,
  ...ibuControllers,
  ...gptControllers,
};
