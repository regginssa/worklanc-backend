const Users = require("../models/users");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const format = require("../utils/format");

const signup = async (req, res) => {
  try {
    const { email, password, signinOption, googleId, appleId } = req.body;
    const already = await Users.getByEmail(email);
    if (already) return res.status(400).json({ message: "You already exist" });

    let hashedPassword;

    switch (signinOption) {
      case "email":
        hashedPassword = await bcrypt.hash(password, 10);
        break;
      case "google":
        hashedPassword = await bcrypt.hash(googleId, 10);
        break;
      case "apple":
        hashedPassword = await bcrypt.hash(appleId, 10);
        break;
      default:
        return res.status(400).json({ message: "No supported sign option" });
    }

    const newUser = await Users.create({
      ...req.body,
      password: hashedPassword,
    });
    const token = jwt.sign({ id: newUser.id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });
    res
      .status(200)
      .json({ ok: true, data: { token: `Bearer ${token}`, user: newUser } });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

const signin = async (req, res) => {
  try {
    const { email, password, signinOption, googleId, appleId } = req.body;
    const user = await Users.getByEmail(email);

    if (user.signin_option !== signinOption)
      return res.status(400).json({
        message: `You signed in with ${format.toTitleCase(user.signin_option)}`,
      });

    let matches = false;

    switch (signinOption) {
      case "email":
        matches = await bcrypt.compare(password, user.password);
        if (!matches)
          return res.status(401).json({ message: "Incorrect password" });
        break;
      case "google":
        matches = await bcrypt.compare(googleId, user.password);
        if (!matches)
          return res.status(401).json({ message: "Unauthorized Google data" });
        break;
      case "apple":
        matches = await bcrypt.compare(appleId, user.password);
        if (!matches)
          return res.status(401).json({ message: "Unauthorized Apple data" });
        break;
      default:
        return res.status(400).json({ message: "No supported sign in option" });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });
    res
      .status(200)
      .json({ ok: true, data: { token: `Bearer ${token}`, user } });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { signin, signup };
