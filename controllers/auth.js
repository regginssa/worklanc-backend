const Users = require("../models/users");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const format = require("../utils/format");

const signup = async (req, res) => {
  try {
    const { email, password, signinOption } = req.body;
    const already = await Users.getByEmail(email);
    if (already) return res.status(400).json({ message: "You already exist" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await Users.create({
      ...req.body,
      password: hashedPassword,
    });
    const token = jwt.sign({ id: newUser.id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });
    res
      .status(200)
      .json({ token: `Bearer ${token}`, user: format.toCamelCase(newUser) });
  } catch (e) {
    console.error("signup error: ", e);
    res.status(500).json({ message: "Internal server error" });
  }
};

const signin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await Users.getByEmail(email);

    if (user.signin_option !== "email")
      return res.status(400).json({
        message: `You signed in with ${format.toTitleCase(user.signin_option)}`,
      });

    const matches = await bcrypt.compare(password, user.password);
    if (!matches)
      return res.status(400).json({ message: "Incorrect password" });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });
    res
      .status(200)
      .json({ token: `Bearer ${token}`, user: format.toCamelCase(user) });
  } catch (e) {
    res.status(500).json({ message: "Internal server error" });
  }
};

const oauth = async (req, res) => {
  try {
    const { signinOption, googleId, appleId, email } = req.body;

    const user = await Users.getByEmail(email);
    let hashedPassword,
      matches = false,
      token;

    if (!user) {
      switch (signinOption) {
        case "google":
          hashedPassword = await bcrypt.hash(googleId, 10);
          break;
        case "apple":
          hashedPassword = await bcrypt.hash(appleId, 10);
          break;
        default:
          return res.status(400).json({ message: "No supported social" });
      }

      const newUser = await Users.create({
        ...req.body,
        password: hashedPassword,
      });
      token = jwt.sign({ id: newUser.id }, process.env.JWT_SECRET, {
        expiresIn: "3d",
      });
      return res
        .status(200)
        .json({ token: `Bearer ${token}`, user: format.toCamelCase(newUser) });
    }

    switch (signinOption) {
      case "google":
        matches = await bcrypt.compare(googleId, user.password);
        break;
      case "apple":
        matches = await bcrypt.compare(appleId, user.password);
        break;
      default:
        return res.status(400).json({ message: "No supported social" });
    }

    if (!matches)
      return res.status(400).json({ message: "Incorrect social account" });
    token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });
    res
      .status(200)
      .json({ token: `Bearer ${token}`, user: format.toCamelCase(user) });
  } catch (e) {
    console.error("oauth error: ", e);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { signin, signup, oauth };
