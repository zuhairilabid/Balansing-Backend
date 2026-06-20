const ClientError = require("../errors/ClientError");

const errorHandler = (err, req, res, next) => {
  console.log(err.message);
  if (err instanceof ClientError) {
    return res.status(err.statusCode).json({
      message: err.message,
    });
  }
  return res.status(500).json({
    message: "Internal Server Error",
  });
};

module.exports = errorHandler;
