var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const request = require("request-promise");
const TwitchWebhook = require('twitch-webhook');
var config = require('config');
const Discord = require("discord.js");

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

function getTwitchUserByName(name) {
  var options = {
    method: 'GET',
    url: `https://api.twitch.tv/helix/users?login=${name}`,
    headers: {
      'Client-ID': config.get('twitch-auth.twitch_api')
    }
  }
  return request(options);
}

function getTwitchUserByID(id) {
  var options = {
    method: 'GET',
    url: `https://api.twitch.tv/helix/users?id=${id}`,
    headers: {
      'Client-ID': config.get('twitch-auth.twitch_api')
    }
  }
  return request(options);
}

function getTwitchGameByID(id) {
  var options = {
    method: 'GET',
    url: `https://api.twitch.tv/helix/games?id=${id}`,
    headers: {
      'Client-ID': config.get('twitch-auth.twitch_api')
    }
  }
  return request(options);
}

function subscribeTwitchLive() {
  let livestreamers = config.get('twitch.live-streamers');
  for (var i = 0; i < livestreamers.length; i++) {
    console.log(`Registering live webhook for ${livestreamers[i]}`)
    getTwitchUserByName(livestreamers[i]).then(function(jsonResponse) {
      //TODO error check
      jsonResponse = JSON.parse(jsonResponse);
      subscribeTwitchLiveWebhook(jsonResponse.data[0].id);
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
    var promises = [getTwitchUserByID(event.data[0].user_id),
      getTwitchGameByID(event.data[0].game_id)
    ];
    Promise.all(promises).then(function() {
      sendDiscordEmbed(event, JSON.parse(arguments[0][0]), JSON.parse(
        arguments[0][1]));
    })
  }
});

function sendDiscordEmbed(event, user, game) {
  var rightNow = new Date();
  var x = rightNow.toISOString();
  //console.log(jsonResponse.stream);
  let embed = new Discord.RichEmbed()
    //.setAuthor(message.author.usernam)
    .setAuthor(user.data[0].display_name,
      user.data[0].logo)
    //.setDescription(jsonResponse.stream.channel.display_name + " is streaming: ")
    .setColor("#9B59B6")
    //TODO get game
    .setDescription(`**Playing**: ${game.data[0].name}`)
    .setTitle(event.data[0].title)
    .setURL(`https://twitch.tv/${user.data[0].login}`)
    .setImage(event.data[0].thumbnail_url.replace("{width}", "400").replace(
      "{height}", "225"))
    .setTimestamp(x)

  //channel_strims.send("Now Live: " + jsonResponse.stream.channel.display_name +"! @here");
  let channels = config.get('announcements.discord.server.channels');
  for (let i = 0; i < channels.length; i++) {
    bot.guilds.find('id', config.get('announcements.discord.server.id')).channels
      .find('name', channels[i]).send(
        embed);
  }
}

const bot = new Discord.Client({
  disableEveryone: false
});

bot.on("ready", async() => {
  subscribeTwitchLive();
  bot.user.setUsername(config.get('discord.bot.username'));
});

bot.on("message", async message => {
  //TODO DATABASE
  var prefix = "!";

  if (message.author.bot) return;
  if (message.channel.type === "dm") return;

  let messageArray = message.content.split(" ");
  let command = messageArray[0];

  if (!command.startsWith(prefix)) return;

  switch (command) {
    case `${prefix}ping`:
      message.channel.send(`pong`);
      break;
  }
});


bot.login(config.get('discord.bot.token')).then((token) => {

}).catch(console.error);

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
    /*
      // or unsubscribe from each one individually
      twitchWebhook.unsubscribe('users/follows', {
        first: 1,
        to_id: 12826
      })
    */
  process.exit(0)
})

module.exports = app;
