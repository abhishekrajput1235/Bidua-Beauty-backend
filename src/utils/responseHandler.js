const successResponse = (res, message, data = {}) => {
  res.status(200).json({
    success: true,
    message,
    data,
  });
};

const errorResponse = (res, message, status = 500) => {
  res.status(status).json({
    success: false,
    message,
  });
};

module.exports = { successResponse, errorResponse };
