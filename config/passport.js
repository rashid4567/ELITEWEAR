const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require('../model/userSChema')
require("dotenv").config();

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

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

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then((user) => {
      done(null, user);
    })
    .catch((error) => {
      done(error, null);
    });
});

module.exports = passport;
