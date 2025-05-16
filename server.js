//server
const express = require("express");
const app = express();
const session = require("express-session");
require("dotenv").config();
const path = require("path");
const PORT = process.env.PORT || 5000;
const nocache = require("nocache");
const connectDB = require("./config/dbs");
const userRouter = require("./routers/userRoute");
const adminRouter = require("./routers/adminRoute");
const { Server } = require("http");
const passport = require("./config/passport");
const flash = require("connect-flash");
const moment = require("moment");
const addCountsMiddleware = require("./middleware/addCountsMiddleware");
const adminNotFoundHandler = require("./middleware/adminErrorHandle");

connectDB();

// Set up view engine
app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "views/user"),
  path.join(__dirname, "views/admin"),
]);

app.locals.moment = moment;

app.use(nocache());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 72 * 60 * 60 * 1000,
    },
  })
);

app.use(flash());
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.error = req.flash("error");
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use(passport.initialize());
app.use(passport.session());

app.use(addCountsMiddleware);

app.use("/admin", adminRouter);
app.use("/", userRouter);

app.use(adminNotFoundHandler);

app.use((req, res) => {
  res.status(404).redirect("/page-not-found");
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

module.exports = Server;
