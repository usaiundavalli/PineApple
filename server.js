if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");
const flash = require("connect-flash");
const path = require("path");
const { check, validationResult } = require("express-validator");
const multer = require("multer");
const fs = require("fs");

const axios = require("axios");
const nodemailer = require("nodemailer");

mongoose
  .connect(process.env.DB_URL)
  .then(() => console.log(" db Connected !...."))
  .catch((err) => console.log(err.message));

const User = require("./models/User");
const mailModel = require("./models/mailModel");

// ///// loggers..
// const logger = require("morgan");
// app.use(logger("dev"));

const winston = require("winston");

//// Create a Winston logger instance
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "combined.log"),
    }),
  ],
});

//// Error handler middleware
app.use((err, req, res, next) => {
  logger.error(
    `${err.status || 500} - ${err.message} - ${req.originalUrl} - ${
      req.method
    } - ${req.ip}`
  );
  res.status(err.status || 500).send("Internal Server Error");
});

// Middleware function to log all requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} ${req.ip}`);
  next();
});

/////
app.use(express.urlencoded({ extended: false }));
// setup nodemailer transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.MY_MAILID,
    pass: process.env.MAIL_PASSWORD,
  },
});

// setup route for sending email
app.post("/", async (req, res) => {
  try {
    var mailDetails = await {
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email,
      subject: req.body.subject,
      bodyOfTheMail: req.body.message,
    };

    // db store
    var dbres = mailModel(mailDetails);
    var dboutput = await dbres.save();

    const mailOptions = await {
      from: process.env.MY_MAILID,
      to: process.env.MY_MAILID,
      subject: dboutput.subject,
      html: `<h4> NAME : ${dboutput.name}</h4>
      <h4>PHONE : ${dboutput.phone}</h4>
      <p>Mail sended by ${dboutput.email}<p>
      <spam>${dboutput.bodyOfTheMail}</spam>`,
    };

    // send mail with defined transport object
    await transporter.sendMail(mailOptions);
    res.render("index", { message: `Email sent successfully` });
  } catch (error) {
    console.log(error);
    res.render("index", { message: `Email sending failed .` });
  }
});

/////

// Passport.js authentication
passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email });
        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return done(null, false, { message: "Invalid email or password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

// Middleware
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

function notensureAuthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return next();
  }
  res.redirect("/dashboard");
}

// Routes
app.get("/", (req, res) => {
  res.status(200).render("index", { user: req.user }, (err, html) => {
    if (err) {
      res.render("error", {
        errorcode: "500 Error",
        errormessage: `Internal Server Error`,
      });
    } else {
      res.status(200).send(html);
    }
  });
});

app.get("/dashboard", ensureAuthenticated, (req, res) => {
  res.status(200).render("dashboard", { user: req.user }, (err, html) => {
    if (err) {
      res.render("error", {
        errorcode: "500 Error",
        errormessage: `Internal Server Error`,
      });
    } else {
      res.status(200).send(html);
    }
  });
});

app.get("/register", notensureAuthenticated, (req, res) => {
  res
    .status(200)
    .render("register", { errors: req.flash("errors") }, (err, html) => {
      if (err) {
        res.render("error", {
          errorcode: "500 Error",
          errormessage: `Internal Server Error`,
        });
      } else {
        res.status(200).send(html);
      }
    });
});

app.post(
  "/register",
  [
    check("email").isEmail().withMessage("Email is invalid"),
    check("password")
      .isLength({ min: 4 })
      .withMessage("Password must be at least 4 characters long"),
  ],
  async (req, res) => {
    const { email, password } = req.body;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      req.flash("errors", errors.array());

      return res.status(301).redirect("/register");
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({
        email,
        password: hashedPassword,
      });
      await user.save();
      req.flash("success", "User created successfully");

      res.redirect("/login");
    } catch (err) {
      console.log(err);
      req.flash("errors", "Internal server error");
      res.status(301).redirect("/register");
    }
  }
);

app.get("/login", notensureAuthenticated, (req, res) => {
  res.render("login", { message: req.flash("error") }, (err, html) => {
    if (err) {
      res.render("error", {
        errorcode: "500 Error",
        errormessage: `Internal Server Error`,
      });
    } else {
      res.status(200).send(html);
    }
  });
});

const storage = multer.diskStorage({
  destination: "./public/uploads/",
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG files are allowed!"));
    }
  },
}).array("myImages", 5); // limit to 5 images at a time

app.set("view engine", "ejs");

app.use(express.static("views"));
app.use(express.static(path.join(__dirname, "public")));

app.get("/upload", ensureAuthenticated, (req, res) => res.render("fileupload"));

app.post("/upload", (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      res.render("fileupload", { msg: err.message });
    } else {
      if (req.files.length == 0) {
        res.render("fileupload", { msg: "Error: No files selected" });
      } else {
        let uploadedFiles = [];
        req.files.forEach((file) => {
          uploadedFiles.push(`uploads/${file.filename}`);
        });
        res.render("fileupload", {
          msg: `${req.files.length} file(s) uploaded successfully`,
          files: uploadedFiles,
        });
      }
    }
  });
});

app.get("/gallery", ensureAuthenticated, (req, res) => {
  const images = [];
  const dirPath = path.join(__dirname, "/public/uploads");
  fs.readdir(dirPath, (err, files) => {
    if (err) {
      console.error(err);
    } else {
      files.forEach((file) => {
        images.push(`uploads/${file}`);
      });
      res.render("gallery", { images: images });
    }
  });
});

app.get("/weather", ensureAuthenticated, async (req, res) => {
  res.status(200).render("weather.ejs", (err, html) => {
    if (err) {
      res.render("error", {
        errorcode: "500 Error",
        errormessage: `Internal Server Error`,
      });
    } else {
      res.status(200).send(html);
    }
  });
});

app.post("/weather", async (req, res) => {
  try {
    const myInputValue = req.body.myInput;
    // Make an HTTP request to the weather service API  countruoutput
    const response = await axios.get(
      `http://api.openweathermap.org/data/2.5/weather?q=${myInputValue}&APPID=${process.env.WEATHER_API_KEY}`
    );

    // Extract the relevant weather data
    const data = response.data;
    const weather = {
      date: response.headers.date,
      countryName: `${data.name}, ${data.sys.country}`,
      lon_lat: `${data.coord.lon}, ${data.coord.lat}`,
      temperature: `${data.main.temp}`,
      pressure: `${data.main.pressure}`,
      humadity: `${data.main.humidity}`,
      sunrise: `${data.sys.sunrise}`,
      sunset: `${data.sys.sunset}`,
      speed_deg_gust: `${data.wind.speed},${data.wind.deg},${data.wind.gust}`,
      description: data.weather[0].description,
    };
    res.status(200).render("weatherTemplate", {
      date: weather.date,
      countryName: `${weather.countryName}`,
      lonlat: `${weather.lon_lat}`,
      temperature: `${weather.temperature}`,
      pressure: `${weather.pressure}`,
      humidity: `${weather.humadity}`,
      sunrise: `${weather.sunrise}`,
      sunset: `${weather.sunset}`,
      speed_deg_gust: weather.speed_deg_gust,
      description: weather.description,
    });
  } catch (err) {
    if (err.hostname) {
      console.error(err.hostname);
      res.status(500).send("500 (Internal Server Error)");
    } else {
      res.status(200).render("weather", {
        error: `Invalid Input`,
      });
    }
  }
});

///////
app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/dashboard",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

// logout ...
app.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.use((req, res) => {
  res.status(404).render("error", {
    errorcode: 404,
    errormessage: "Not Found",
  });
});

// Start server
const port = process.env.PORT || 9999;
app.listen(port, () => {
  console.log(`Sever started on port : ${port}`);
});
