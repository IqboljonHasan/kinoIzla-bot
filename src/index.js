const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const geolib = require('geolib');
const _ = require('lodash');

const config = require('./config');
const helper = require('./helper');
const keyboard = require('./keyboard');
const kb = require('./keyboard-buttons');
const database = require('../database.json');

helper.logStart();

//=============================================================================
mongoose.connect(config.DB_URL, {
    useNewUrlParser: true
})
    .then(() => console.log('MongoDB has connected'))
    .catch((err) => {console.log("Not Connected to Database ERROR! \n", err)});

require('./model/film.model');
require('./model/cinema.model');
require('./model/user.model');

const Film = mongoose.model('films');
const Cinema = mongoose.model('cinemas');
const User = mongoose.model('users');

// database.films.forEach(f => new Film(f).save().catch(e => console.log(e)));

// database.cinemas.forEach(c => new Cinema(c).save().catch(e => console.log(e)));

const ACTION_TYPE = {
    TOGGLE_FAV_FILM: 'tff',
    SHOW_CINEMAS: 'sc',
    SHOW_CINEMAS_MAP: 'scm',
    SHOW_FILMS: 'sf'
};

//=============================================================================
const bot = new TelegramBot(config.TOKEN, {
    polling: true
});

bot.on('message', msg => {
    const chatId = helper.getChatId(msg);
    switch(msg.text) {
        case kb.home.films:
            bot.sendMessage(chatId, 'Janrni tanlang:', {
                reply_markup: {
                    keyboard: keyboard.films
                }
            });
            break;
        case kb.films.action:
            sendFilmsByQuery(chatId, {type: 'action'});
            break;
        case kb.films.comedy:
            sendFilmsByQuery(chatId, {type: 'comedy'});
            break;
        case kb.films.random:
            sendFilmsByQuery(chatId, {});
            break;
        case kb.back:
            bot.sendMessage(chatId, 'Boshlash uchun quyidagilardan birini tanlang:', {
                reply_markup: {
                    keyboard: keyboard.home
                }
            });
            break;
        case kb.home.cinemas:
            bot.sendMessage(chatId, 'Joylashuvni jo\'natish', {
                reply_markup: {
                    keyboard: keyboard.cinemas
                }
            });
            break;
        case kb.home.favourite:
            showFavFilms(chatId, msg.from.id);
            break;
    }

    if(msg.location){
        console.log(msg.location);
        getCinemasInCoord(chatId, msg.location)
    }
});

bot.onText(/\/start/, msg => {
    const text = `Salom, ${msg.from.first_name}\nBoshlash uchun quyidagilardan birini tanlang:`;
    bot.sendMessage(helper.getChatId(msg), text, {
        reply_markup: {
            keyboard: keyboard.home
        }
    })
});

bot.on('callback_query', query => {

    const userId = query.from.id;
    let data;

    try{
        data = JSON.parse(query.data)
    } catch (e) {
        throw new Error('Data is not an object')
    }

    const {type} = data;

    if(type === ACTION_TYPE.SHOW_CINEMAS_MAP){
        let {lat, lon} = data;
        bot.sendLocation(query.message.chat.id, lat, lon)
    }
    else if(type === ACTION_TYPE.TOGGLE_FAV_FILM){
        toggleFavFilm(userId, query.id, data)
    }
    else if(type === ACTION_TYPE.SHOW_FILMS){
        sendFilmsByQuery(userId, {uuid: {'$in': data.filmUuid}})
    }
    else if(type === ACTION_TYPE.SHOW_CINEMAS){
        sendCinemasByQuery(userId, {uuid: {'$in': data.cinemasUuid}})
    }

});

// bot.on('inline_query', query => {
//     Film.find({}).then(films => {
//
//         const results = films.map(f => {
//             const caption = `Film nomi: ${f.name}\nJanri: ${f.type}\nYili: ${f.year}\nDavomiyligi: ${f.length} soat\nDavlati: ${f.country}\nReyting: ${f.rate}\n`;
//             return {
//                 id: f.uuid,
//                 type: 'photo',
//                 photo_url: f.pic,
//                 thumb_url: f.pic,
//                 caption: caption,
//                 reply_markup: {
//                     inline_keyboard: [
//                         [
//                             {
//                                 text: `Filmi.uz: ${f.name}`,
//                                 url: f.link
//                             }
//                         ]
//                     ]
//                 }
//             }
//         });
//
//         bot.answerInlineQuery(query.id, results, {
//             cache_time: 0
//         })
//     })
// });

bot.onText(/\/f(.+)/, (msg, [source, match]) => {
    const filmUuid = helper.getItemUuid(source);
    const chatId = helper.getChatId(msg);


    Promise.all([
        Film.findOne({uuid: filmUuid}),
        User.findOne({telegramId: msg.from.id})
    ]).then(([film, user]) => {

        let isFav = false;

        if(user){
            isFav = user.films.indexOf(film.uuid) !== -1
        }

        const favText = isFav ? "Sevimlilardan olib tashlash" : "Sevimlilarga qo'shish";

        const caption = `Film nomi: ${film.name}\nJanri: ${film.type}\nYili: ${film.year}\nDavomiyligi: ${film.length} soat\nDavlati: ${film.country}\nReyting: ${film.rate}\n`;
        bot.sendPhoto(chatId, film.pic, {
            caption: caption,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: favText,
                            callback_data: JSON.stringify({
                                type: ACTION_TYPE.TOGGLE_FAV_FILM,
                                filmUuid: film.uuid,
                                isFav: isFav
                            })
                        }

                    ],
                    [
                        {
                            text: "Kinoteatrlar ro'yxati",
                            callback_data: JSON.stringify({
                                type: ACTION_TYPE.SHOW_CINEMAS,
                                cinemasUuid: film.cinemas
                            })
                        }
                    ],
                    [
                        {
                            text: "Filmi.uzda ko'rish",
                            url: film.link
                        }
                    ]
                ]
            }
        })
    });
 });

bot.onText(/\/c(.+)/, (msg, [source, match]) => {
    const cinemaUuid = helper.getItemUuid(source);
    const chatId = helper.getChatId(msg);
    Cinema.findOne({uuid: cinemaUuid}).then(cinema => {

        bot.sendMessage(chatId, `Kinoteatr ${cinema.name}`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: cinema.name,
                            url: cinema.url
                        }
                    ],
                    [
                        {
                            text: 'Xaritada ko\'rish',
                            callback_data: JSON.stringify({
                                type: ACTION_TYPE.SHOW_CINEMAS_MAP,
                                lat: cinema.location.latitude,
                                lon: cinema.location.longitude
                            })
                        }
                    ],
                    [
                        {
                            text: 'Filmni ko\'rish',
                            callback_data: JSON.stringify({
                                type: ACTION_TYPE.SHOW_FILMS,
                                filmUuid: cinema.films
                            })
                        }
                    ]
                ]

            }
        })
        }
    )
});

// =================functions========================

function sendFilmsByQuery(chatId, query) {
    Film.find(query).then(films => {
        const html = films.map((films, i) => {
            return `<b>${i+1}. </b>${films.name} - /f${films.uuid}`;
        }).join('\n');

        sendHTML(chatId, html, 'films')

    })
}

function sendHTML(chatId, html, kbName = null) {
    const options = {
        parse_mode: 'HTML'
    };

    if(kbName){
        options['reply_markup'] = {
            keyboard: keyboard[kbName]
        }
    }

    bot.sendMessage(chatId, html, options)

}

function getCinemasInCoord(chatId, location) {
    Cinema.find({}).then(cinemas => {

        cinemas.forEach(c => {
            c.distance = geolib.getDistance(location, c.location, 1) / 1000;
            // console.log(c.location);
        });
        cinemas = _.sortBy(cinemas, 'distance');

        const html = cinemas.map((c, i) => {
            return `<b>${i+1}</b> ${c.name}. <em>Uzoqligi</em> - <strong>${c.distance}</strong> km. /c${c.uuid}`;
        }).join('\n');

        sendHTML(chatId, html, 'home')
    })
}

function toggleFavFilm(userId, queryId, {filmUuid, isFav}) {

    let userPromise;

    User.findOne({telegramId: userId})
        .then(user => {
            if(user){
                if(isFav){
                    user.films = user.films.filter(fUuid => fUuid !== filmUuid)
                }
                else{
                    user.films.push(filmUuid)
                }
                userPromise = user
            }
            else{
               userPromise = new User({
                    telegramId: userId,
                    films: [filmUuid]
                })
            }
            const answerText  = isFav ? "O'chirildi" : "Qo'shildi";

            userPromise.save().then(_ => {
                bot.answerCallbackQuery({
                    callback_query_id: queryId,
                    text: answerText
                })
            }).catch(err => console.log(err))
        }).catch(err => console.log(err))
}

function showFavFilms(chatId, telegramId) {
    User.findOne({telegramId})
        .then(user => {
            // console.log(user);
            if(user){
                Film.find({uuid: {
                    '$in': user.films
                    }}).then(films => {
                        let html;
                        if(films.length){
                            html = films.map((f, i) => {
                                return `<b>${i+1}</b> ${f.name} - <b>${f.rate}</b> (/f${f.uuid})`
                            }).join('\n')
                        }
                        else{
                            html = 'Hali hech qanday film qo\'shilmagan'
                        }
                        sendHTML(chatId, html, 'home')
                }).catch(e => console.log(e))
            }
            else{
                sendHTML(chatId, 'Hali hech qanday film qo\'shilmagan', 'home')
            }
        }).catch(e => console.log(e))
}

function sendCinemasByQuery(userId, query) {
    Cinema.find(query).then(cinemas => {

        const html = cinemas.map((c, i) => {
            return `<b>${i+1}</b> ${c.name} - /c${c.uuid}`
        }).join('\n');

        sendHTML(userId, html, 'home')
    })
}
