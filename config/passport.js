const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const User = require("../model/userSchema");
require("dotenv").config();

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;


passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email });
        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }

        if (user.googleId && !user.password) {
          return done(null, false, { message: "Please use Google to log in" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Invalid email or password" });
        }

        if (user.isBlocked) {
          return done(null, false, {
            message: "Sorry, your account is blocked by the admin.",
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

passport.use(
  new GoogleStrategy(
    {
      clientID: clientID,
      clientSecret: clientSecret,
      callbackURL: "http://localhost:3313/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {

        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          if (user.isBlocked) {
            return done(null, false, {
              message: "Sorry, your account is blocked by the admin.",
            });
          }
          return done(null, user);
        }

        user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
     
          if (user.password) {
            return done(null, false, {
              message:
                "Account already exists. Please log in with your email and password.",
            });
          }

          if (user.isBlocked) {
            return done(null, false, {
              message: "Sorry, your account is blocked by the admin.",
            });
          }
          user.googleId = profile.id;
          await user.save();
          return done(null, user);
        }


        user = new User({
          fullname: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
        });
        await user.save();
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;