const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const User = require("../model/userSchema");
require("dotenv").config();

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

// Helper function to rebuild the mobile field index if needed
async function ensureProperMobileIndex() {
  try {
    // This will only run once when the server starts
    await User.collection.dropIndex("mobile_1").catch(() => {
      // Index might not exist, which is fine
      console.log("No existing mobile index to drop or couldn't drop index");
    });
    
    // Create a new sparse index
    await User.collection.createIndex(
      { mobile: 1 }, 
      { unique: true, sparse: true }
    );
    console.log("Successfully created sparse index for mobile field");
  } catch (error) {
    console.error("Error ensuring proper mobile index:", error);
  }
}

// Run this when the file is first loaded
ensureProperMobileIndex();

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
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
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

        // Create new user with mobile field explicitly set to undefined
        // This prevents MongoDB from storing a null value for the mobile field
        const newUser = new User({
          fullname: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          isVerified: true,
          mobile: undefined // Explicitly set to undefined to avoid null values
        });

        // Use a try-catch block to handle potential duplicate key errors
        try {
          await newUser.save();
          return done(null, newUser);
        } catch (saveError) {
          // If we still get a duplicate key error despite our precautions
          if (saveError.code === 11000 && saveError.keyPattern?.mobile) {
            console.error("Duplicate mobile key error despite precautions:", saveError.message);
            
            // Try a different approach - use a direct MongoDB insert with unset mobile field
            const userDoc = {
              fullname: profile.displayName,
              email: profile.emails[0].value,
              googleId: profile.id,
              isVerified: true,
              referralCode: newUser.referralCode,
              createdAt: new Date()
            };
            
            const result = await User.collection.insertOne(userDoc);
            if (result.insertedId) {
              const insertedUser = await User.findById(result.insertedId);
              return done(null, insertedUser);
            }
          }
          
          // For any other error, pass it through
          console.error("Error creating new Google user:", saveError);
          return done(saveError);
        }
      } catch (error) {
        console.error("Google authentication error:", error);
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