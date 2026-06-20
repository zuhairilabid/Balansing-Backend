const notFound = (req, res) => {
  res.status(404).json({
    message: "Url Not Found",
  });
};

module.exports = notFound;
