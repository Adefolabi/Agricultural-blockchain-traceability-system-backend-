'use strict';

// Returns a middleware that restricts access to the specified roles.
// Must be placed after the authenticate middleware so req.user is populated.
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: this action requires one of the following roles: ${allowedRoles.join(', ')}`,
      });
    }
    next();
  };
}

module.exports = authorize;
