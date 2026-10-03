function createAuthError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    next(createAuthError(401, 'Vui lòng đăng nhập để tiếp tục.'));
    return;
  }

  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      next(createAuthError(401, 'Vui lòng đăng nhập để tiếp tục.'));
      return;
    }

    if (!roles.includes(req.session.role)) {
      next(createAuthError(403, 'Bạn không có quyền thực hiện thao tác này.'));
      return;
    }

    next();
  };
}

module.exports = { requireLogin, requireRole };