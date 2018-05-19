var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const request = require("request-promise");
const TwitchWebhook = require('twitch-webhook');
var config = require('config');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

const twitchWebhook = new TwitchWebhook({
  client_id: config.get('twitch-auth.twitch_api'),
  callback: config.get('twitch-webhook.callbackurl'),
  secret: 'It\'s a secret', // default: false
  lease_seconds: config.get('twitch-webhook.lease_seconds'), // default: 864000 (maximum value)
  listen: {
    port: config.get('twitch-webhook.port'), // default: 8443
    //host: '127.0.0.1', // default: 0.0.0.0
    //autoStart: false // default: true
  }
});

function getTwitchUserByName(name, callback) {
  var options = {
    method: 'GET',
    url: `https://api.twitch.tv/kraken/users?login=${name}`,
    headers: {
      'Accept': 'application/vnd.twitchtv.v5+json',
      'Client-ID': config.get('twitch-auth.twitch_api')
    }
  }

  request(options, function(error, response, body) {
    callback(JSON.parse(body));
  });
}

function getTwitchUserByID(id, callback) {
  var options = {
    method: 'GET',
    url: `https://api.twitch.tv/kraken/users?id=${id}`,
    headers: {
      'Accept': 'application/vnd.twitchtv.v5+json',
      'Client-ID': config.get('twitch-auth.twitch_api')
    }
  }

  request(options, function(error, response, body) {
    callback(JSON.parse(body));
  });
}

function subscribeTwitchLive() {
  let livestreamers = config.get('twitch.live-streamers');
  for (var i = 0; i < livestreamers.length; i++) {
    console.log(`Registering live webhook for ${livestreamers[i]}`)
    getTwitchUserByName(livestreamers[i], function(jsonResponse) {
      //TODO error check
      subscribeTwitchLiveWebhook(jsonResponse.users[0]._id);
    })
  }
}

function subscribeTwitchLiveWebhook(id) {
  twitchWebhook.subscribe('streams', {
    user_id: id
  });
}

twitchWebhook.on('streams', ({
  topic, options, endpoint, event
}) => {
  // topic name, for example "streams"
  console.log(topic)
    // topic options, for example "{user_id: 12826}"
  console.log(options)
    // full topic URL, for example
    // "https://api.twitch.tv/helix/streams?user_id=12826"
  console.log(endpoint)
    // topic data, timestamps are automatically converted to Date
  console.log(event)
  if (event.data.length != 0) {
    getTwitchUserByID(event.data[0].user_id, function(user) {
      console.log(user);
      //user = JSON.parse(user);
    })
  }
});

function sendDiscordEmbed(channel, embed) {
  var rightNow = new Date();
  var x = rightNow.toISOString();
  //console.log(jsonResponse.stream);
  let embed = new Discord.RichEmbed()
    //.setAuthor(message.author.usernam)
    .setAuthor(user.users[0].display_name,
      user.users[0].channel.logo)
    //.setDescription(jsonResponse.stream.channel.display_name + " is streaming: ")
    .setColor("#9B59B6")
    //TODO get game
    .setDescription("**Playing**: " + "")
    .setTitle(event.data[0].title)
    .setURL(`https://twitch.tv/${user.users[0].name}`)
    .setImage(event.data[0].thumbnail_url)
    .setTimestamp(x)

  if (spam) {
    let channel = channel_spam;
  } else {
    let channel = channel_strims;
  }

  //channel_strims.send("Now Live: " + jsonResponse.stream.channel.display_name +"! @here");
  channel_spam.send(embed);
}

subscribeTwitchLive();

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// renew the subscription when it expires
twitchWebhook.on('unsubscibe', (obj) => {
  twitchWebhook.subscribe(obj['hub.topic'])
})

// tell Twitch that we no longer listen
// otherwise it will try to send events to a down app
process.on('SIGINT', () => {
  // unsubscribe from all topics
  twitchWebhook.unsubscribe('*')

  // or unsubscribe from each one individually
  twitchWebhook.unsubscribe('users/follows', {
    first: 1,
    to_id: 12826
  })

  process.exit(0)
})

module.exports = app;
