const express = require("express");
const app = express();
require("dotenv").config();
require("./config/db");

const PORT = 5001;

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
