const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const passport = require("passport");
require("dotenv").config();
require("./config/passport")(passport);
require("./config/db");

const app = express();

app.use(cors());
app.use(passport.initialize());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api", require("./routes"));

const PORT = 5001;

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
