function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const requestedStatus = Number(err.statusCode || err.status);
  const statusCode =
    Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus < 600
      ? requestedStatus
      : 500;
  if (statusCode >= 500) {
    console.error(err);
  }

  const message =
    statusCode >= 500
      ? 'Đã xảy ra lỗi trên máy chủ.'
      : err.message || 'Yêu cầu không hợp lệ.';

  res.status(statusCode).json({
    ok: false,
    error: message,
    ...(err.details ? { data: err.details } : {}),
  });
}

module.exports = errorHandler;
