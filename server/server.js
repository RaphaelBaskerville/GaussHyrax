var express = require('express');
var db = require('./db.js');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var passport = require('passport');
var GitHubStrategy = require('passport-github').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var env = require('node-env-file');
var http = require('http');
var request = require('request');

env(__dirname + '/.env' || process.env);

var sendgrid  = require('sendgrid')(process.env.SENDGRIDAPIKEY);
var GITHUB_CLIENT_ID = process.env.GITHUBCLIENTID;
var GITHUB_CLIENT_SECRET = process.env.GITHUBCLIENTSECRET;
var TWITTER_CONSUMER_KEY = process.env.TWITTERAPIKEY;
var TWITTER_CONSUMER_SECRET = process.env.TWITTERSECRET;
var FACEBOOK_APP_ID = process.env.FACEBOOKAPPID;
var FACEBOOK_APP_SECRET = process.env.FACEBOOKAPPSECRET;

var port = process.env.PORT || 3000;

var app = express();

// app.use(morgan('combined'));
app.use(express.static(__dirname + '/../client'));  //serve files in client
app.use(bodyParser.json());  // parse application/json
app.use(passport.initialize());

//function to configure the standard response handler

var configHandler = function (successCode, failCode, res) {
  return function (err, data) {
    if (err) {
      res.status(failCode).send(err);
    } else {
      res.status(successCode).send(data);
    }
  };
};

/////////////////////////////
/////////Passport////////////
/////////////////////////////
var noobyGlobalVariable;

passport.serializeUser(function (user, done) {
  if (user.id) {
    done(null, user.id);
  } else {
    done(null, user);
  }
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    console.log('deserializing err', err);
    done(err, user);
  });
});

passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: 'https://prsnl-2.herokuapp.com/auth/github/callback',
},
  function (accessToken, refreshToken, profile, done) {
    db.User.findOne({ userName: profile.username }, function (err, user) {
      if (user) {
        noobyGlobalVariable = user;
        return done(null, user);
      } else {
        var user = new db.User();
        user.userName = profile.username;
        user.save(function (err, user) {
          if (err) {
            return done(null, false);
          } else {
            noobyGlobalVariable = user;
            return done(null, user);
          }
        });
      }
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: FACEBOOK_APP_ID,
    clientSecret: FACEBOOK_APP_SECRET,
    callbackURL: 'http://localhost:3000/auth/facebook/callback',

    // enableProof: false,
  },
  function (accessToken, refreshToken, profile, done) {
    db.User.findOne({ userName: profile.displayName }, function (err, user) {
      if (user) {
        noobyGlobalVariable = user;
        return done(null, user);
      } else {
        // console.log('no user', user);
        var user = new db.User();
        user.userName = profile.displayName;
        user.save(function (err, user) {
          if (err) {
            return done(null, false);
          } else {
            noobyGlobalVariable = user;
            return done(null, user);
          }
        });
      }
    });
  }
));

//////////////////////////////////////////
//CREATE
//////////////////////////////////////////

//save a user to DB
app.post('/api/user', function (req, res, next) {
  db.addUser(req.body, configHandler(201, 400, res));
})

//add new family member to user
.post('/api/family/:userId', function (req, res, next) {
  db.addFamilyMember(req.params, req.body, configHandler(201, 400, res));
})

//add new history to user's family member
.post('/api/history/:userId/:familyId', function (req, res, next) {
  db.addHistory(req.params, req.body, configHandler(201, 400, res));
})

//////////////////////////////////////////
//READ
//////////////////////////////////////////
.post('/api/grid', function (req, res, next) {
  var email = req.body.theEmail;
  var message = req.body.theMessage;
  sendgrid.send({
    to:       email,
    from:     'diyelpin@gmail.com',
    subject:  'GOT EM',
    text:     message,
  }, function (err, json) {
    if (err) { return console.error(err); }

    console.log(json);
  });
})

//passport github //
///////////////////
.get('/auth/github',
  passport.authenticate('github'))

.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/login', scope: ['user:email'] }),
  function (req, res) {
    res.redirect('/#/dashboard');
  })
.get('/githubinfo', function (req, res) {
  if (noobyGlobalVariable) {
    res.status(200).send(noobyGlobalVariable);
  } else {
    res.status(404).send();
  }
})

//Facebook passport
.get('/auth/facebook',
  passport.authenticate('facebook')
)

.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/' }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect('/#/dashboard');
  })

// .get('/facebookInfo', function(req, res) {
//   console.log('entered facebookUser get request', noobyGlobalVariable);
//   if (noobyGlobalVariable) {
//     res.status(200).send(noobyGlobalVariable);
//   } else {
//     res.status(404).send();
//   }
// })

// .get('/auth/facebook',
//   passport.authenticate('facebook', { scope: ['user_status', 'user_checkins'] })
// )

//end Facebook passport

  // find a user
.get('/api/user/:userName/:password', function (req, res, next) {
  db.verifyUser(req.params, configHandler(200, 404, res));
})

//get all family info for a user
.get('/api/family/:userId', function (req, res, next) {
  db.getAllFamily(req.params, configHandler(200, 400, res));
})

//get a single family member
.get('/api/family/:userId/:familyId', function (req, res, next) {
  db.getSingleFamilyMember(req.params, configHandler(200, 400, res));
})

//get all actions
.get('/api/actions', function (req, res, next) {
  db.getAllActions(configHandler(200, 400, res));
})

//////////////////////////////////////////
//UPDATE
//////////////////////////////////////////

//update family member
.put('/api/family/:userId/:familyId', function (req, res, next) {
  db.updateFamilyMember(req.params, req.body, configHandler(201, 400, res));
})

//update history member
.put('/api/history/:userId/:familyId/:historyId', function (req, res, next) {
  db.updateHistory(req.params, req.body, configHandler(201, 400, res));
})

//////////////////////////////////////////
//DELETE
//////////////////////////////////////////

//delete family member
.delete('/api/family/:userId/:familyId', function (req, res, next) {
  db.deleteFamilyMember(req.params, configHandler(201, 400, res));

})

//delete history
.delete('/api/history/:userId/:familyId/:historyId', function (req, res, next) {
  db.deleteHistory(req.params, configHandler(201, 400, res));
})

///////////////////////////////
// get tweets
///////////////////////////////

// here we set up the get handler that will send a request for the users tweet and then send it to our client-side app.
// route has one param, any user's twitter handle
.get('/tweets/:handle', function (req, ourResponse, next) {
  // set options
  var options = {
    // append the user's handle to the url
    url: 'https://api.twitter.com/1.1/statuses/user_timeline.json?count=1&screen_name=' + req.params.handle,
    method: 'GET',
    headers: {
      // append the access token to the string Bearer with a space.
      Authorization: 'Bearer ' + twitterAppToken.access_token,
    },
  };

  // Send a get request to twitter, notice that the response that we send in the callback is the response from the outer-function passed in through closure.
  request(options, function (err, responseFromTwitter, body) {
    ourResponse.status(200).send(JSON.parse(body)[0]);
  });
});

//////////////////////////////////////////////////////////////////
//Set up and send a request for our application-only oAuth token.
///////////////////////////////////////////////////////////////////

// create a variable to hold our token.
var twitterAppToken;

// store our twitter key and secret
var consumerKey = TWITTER_CONSUMER_KEY;
var consumerSecret = TWITTER_CONSUMER_SECRET;

// concat the key and secret seperated by a colon.
var bearerTokenCred = consumerKey + ':' + consumerSecret;

// pass the key string into Buffer constructor to create a buffer obj.
var bufferedToken = new Buffer(bearerTokenCred);

// encode the buffer object in base64
var encodedAndBufferedToken = bufferedToken.toString('base64');

// set up options, you need quotes around keys with hyphens
var options = {
  url: 'https://api.twitter.com/oauth2/token',
  body: 'grant_type=client_credentials',
  method: 'POST',
  'Accept-Encoding': 'gzip',
  headers: {
    Authorization: 'Basic ' + encodedAndBufferedToken,
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  },
};

// request and save an application-only token from twitter
request(options, function (err, response, body) {
  twitterAppToken = JSON.parse(body);
});

//////////////////////////////////////////
//CRON////////////////////////////////////
//////////////////////////////////////////
//run daily check

/* DAILY CHECK */

//cron job
//every day
//check user end date
//if end date === today, send email to that user

var checkEndDates = function () {
  db.emailToDoList(function (toDoList) {
    if (toDoList.length > 0) {
      for (var i = 0; i < toDoList.length; i++) {
        var email = toDoList[i][0];
        var memberName = toDoList[i][2];
        var message = "It's time to contact" + memberName + ' !';

        sendgrid.send({
          to:       email,
          from:     'diyelpin@gmail.com',
          subject:  'Message from prsnl-2.herokuapp.com',
          text:     message,
        }, function (err, json) {
          if (err) { return console.error(err); }

          console.log(json);
        });
      }
    }
  });
};

var CronJob = require('cron').CronJob;
new CronJob('* */50 16-17 * * 1-7', function () {
  checkEndDates();
}, null, true, 'America/Los_Angeles');

app.listen(port);
console.log('server listening on port ' + port + '...');
