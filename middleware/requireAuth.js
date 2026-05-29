const passport = require("passport");

// Rejects the request when there is no valid JWT, otherwise attaches req.user.
const requireAuth = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireAuth;
